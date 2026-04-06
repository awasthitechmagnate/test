const mongoose = require("mongoose");
const dotenv = require("dotenv");
const moment = require("moment");
const LLM = require("../models/LLM");
const User = require("../models/User");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  extractDomainUrlTitle,
  fetchLocationCode,
  readAIExcelFile,
  readLLMExcelFile,
  // cleanUrl,
  getKeywordCount,
} = require("../utils/helper");

dotenv.config();
const { Parser } = require("json2csv");
const fs = require("fs");
const axios = require("axios");
const xlsx = require("xlsx");
const Task = require("../models/Task");
const AIMode = require("../models/AIMode");
const NodeCache = require("node-cache");
const { enqueueUrlScans } = require("../services/urlScanService");
const UrlScan = require("../models/UrlScan");
const enqueueUrlFetch = require("../services/urlFetchService");
const UrlFetch = require("../models/UrlFetch");

// Cache expensive prompt baseline extraction (Excel parsing) for Advance Filter comparisons
const llmAdvanceFilterPromptCache = new NodeCache({
  stdTTL: 60 * 60, // 1 hour
  checkperiod: 10 * 60,
});

const getKeywordCount1 = async (fileUrl, project_type) => {
  const workbook = new ExcelJS.Workbook();
  // Ensure absolute path
  const absolutePath = path.join(__dirname, "..", `${project_type}_uploads`, path.basename(fileUrl));

  await workbook.xlsx.readFile(absolutePath);

  const worksheet = workbook.worksheets[0];
  let keywords = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const keyword = row.getCell(1).value;
      if (keyword) keywords.push(keyword.toString().trim());
    }
  });

  return keywords.length || 0;
}
// utils/urlUtils.js (for example)
function cleanUrl(raw) {
  if (!raw) return null;

  let input = String(raw).trim();

  // ensure protocol so URL() works
  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`;
  }

  try {
    const url = new URL(input);

    // Strip tracking + hash – adjust if you want to keep some query params
    url.hash = "";
    url.search = "";

    return url.toString();
  } catch (e) {
    console.warn("cleanUrl() – invalid URL:", raw, e.message);
    return null;
  }
}

function readExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
}

const safeDecode = (v) => {
  try {
    return decodeURIComponent(v || "").replace(/\+/g, " ");
  } catch {
    return v;
  }
};

const exportLLMRankings = async (req, res) => {
  try {
    const { slug } = req.params;
    let { filter } = req.query;

    let parsedFilter = {};
    if (filter) parsedFilter = JSON.parse(filter);

    const projectId = parsedFilter.project;
    const project = await LLM.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Assuming Task model returns documents with a MongoDB '_id' field
    // We will now sort by task ID here to ensure prompts are processed in insertion order
    const tasks = await Task.find({ task_type: slug, project_id: projectId }).sort({ _id: 1 });
    if (!tasks || tasks.length === 0)
      return res.status(404).json({ error: "Tasks not found" });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Export");
    // Header remains the same, but 'Mentions' will be 1 for every row
    sheet.addRow(["Prompt", "Rank", "Domain", "Mentions", "URL"]);

    // --- Core Logic: Iterate tasks and process/write data *per annotation* ---
    for (const task of tasks) {
      const keyword = safeDecode(task.data.user_prompt);
      const rawResults = task.results?.[0];
      if (!rawResults) continue;

      let annotations = [];

      // Extract all annotations for the task
      if (slug === "llm_claude") {
        annotations = rawResults.items?.[0]?.sections
          ?.filter((s) => s.annotations && s.annotations.length > 0)
          .map((s) => s.annotations)
          .flat() || [];
      } else {
        annotations = rawResults.items?.[0]?.sections?.[0]?.annotations || [];
      }

      // We will now write a row for EACH annotation
      annotations.forEach((item, index) => {
        let domain = "";
        let url = item.url || "";
        let domainIdentifier = "";

        // Extract domain based on LLM type
        switch (slug) {
          case "llm_chatgpt":
          case "llm_perplexity":
            if (item.url) {
              try {
                const urlObj = new URL(item.url);
                domainIdentifier = urlObj.hostname.replace(/^www\./, "").toLowerCase().trim();
              } catch {
                domainIdentifier = "";
              }
            }
            break;

          case "llm_gemini":
            // NOTE: Your original code for gemini/claude was mixed up. 
            // I'm assuming for 'llm_gemini' you want the title as the domain, 
            // and for 'llm_claude' you want the URL hostname.
            domainIdentifier = (item.title || "").replace(/^www\./, "").toLowerCase().trim();
            break;

          case "llm_claude":
            if (item.url) {
              try {
                const urlObj = new URL(item.url);
                domainIdentifier = urlObj.hostname.replace(/^www\./, "").toLowerCase().trim();
              } catch {
                domainIdentifier = "";
              }
            }
            break;
        }

        if (!domainIdentifier) return;

        // Add a row for the current annotation/source link
        sheet.addRow([
          keyword,            // The original prompt/keyword
          index + 1,          // LOCAL Rank/position of the link in the LLM's response (1, 2, 3...)
          domainIdentifier,   // The domain
          1,                  // Mentions (This row is a single instance/mention)
          url || ""           // The source URL
        ]);
      });
    }
    // --- End of Core Logic ---

    // NOTE: Sorting logic (Step 2) and global map logic are removed.
    // The data is now ordered by Task ID (Prompt) then by Citation Rank.

    // Stream Excel response
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${slug}_rankings.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getLLMProjects = async (req, res) => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, startDate, endDate } = req.query;
    const userId = req.user.id;
    const role = req.user.role;

    // 1️⃣ Build base query
    const query = {
      is_delete: false,
      is_active: true,
    };

    if (role !== "admin") {
      query.users = userId;
    }

    // 2️⃣ Name search (prefix search – index-friendly)
    if (name) {
      query.name = new RegExp(`^${name}`, "i");
    }

    // 3️⃣ Date range filter
    if (startDate || endDate) {
      query.created_at = {};
      if (startDate) query.created_at.$gte = new Date(startDate);
      if (endDate) query.created_at.$lte = new Date(endDate);
    }

    // 4️⃣ Query with projection
    const projects = await LLM.find(query)
      .sort({ created_at: -1 })
      .select("name brand target type frequency competitors is_active total_keywords created_at")
      .lean();

    res.json({ projects });

  } catch (err) {
    console.error("getLLMProjects error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const editProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, target, frequency, is_active, competitors, type } = req.body;

    const updatedProject = await LLM.findByIdAndUpdate(
      id,
      { name, target, frequency, brand, competitors, type, is_active },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      message: "Project updated successfully",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Server error" });
  }
}

const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    let project = await LLM.findById(id)

    project.is_delete = true
    await project.save()

    res.json({
      message: "Project deleted successfully",
      project: project,
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Server error" });
  }
}

const getLLMRankings = async (req, res) => {
  try {
    const { slug } = req.params;
    const { filters } = req.query;
    let parsedFilters = {};

    if (filters) {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (err) {
        return res.status(400).json({ error: "Invalid filters JSON" });
      }
    }
    const { project: projectId, startDate, endDate, domain, tab } = parsedFilters;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    let query = { task_type: slug, project_id: projectId };

    if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    // 1. Fetch project
    const project = await LLM.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // 2. Fetch all tasks for given slug
    const tasks = await Task.find(query);

    if (!tasks.length) {
      return res.json({
        message: "No tasks found",
        data: {
          project: {
            id: project._id,
            target: project.target,
          },
          totalKeywords: 0,
          totalCitations: 0,
          domainMatches: 0,
          tasks: [],
        },
      });
    }

    let totalKeywords = tasks.length;

    // 3. Process each task
    let allResults = [];
    let totalCitations = 0;
    let domainMatches = 0;

    for (let task of tasks) {
      let rawResults = task.results || [];
      const keyword = task.keyword;

      let sources = [];
      let annotations = [];
      let allAnnotations = []

      if (slug === "llm_claude") {
        const cita = rawResults[0]?.items[0]?.sections.filter(
          (item) => item.annotations !== null
        ) || [];
        annotations = cita.map((n) => n.annotations);
        citaLength = cita.length;
        annotations = annotations.flat().map(item => ({
          ...item,
          keyword: keyword
        }));
        allAnnotations = annotations
        annotations = annotations.flat().filter((s) => {
          try {
            const urlDomain = new URL(s.url).hostname.replace(/^www\./, "");
            const targetDomain = project.target.replace(/^www\./, "");
            return urlDomain === targetDomain;
          } catch (e) {
            return false;
          }
        })
      } else if (slug === "llm_gemini") {
        sources = rawResults[0]?.items[0]?.sections[0]?.annotations.filter((item) => item.title === project.target) || [];
      } else if (slug === "llm_perplexity") {
        // sources = rawResults[0]?.items[0]?.sections[0]?.annotations.filter((item) => item.url === project.target) || [];
        sources = rawResults[0]?.items[0]?.sections[0]?.annotations.filter(item => {
          try {
            const urlObj = new URL(item.url);
            const domain = urlObj.hostname;
            return domain === project.target;
          } catch (err) {
            return false;
          }
        }) || [];
      }
      else {
        const cita = rawResults[0]?.items[0]?.sources.filter((item) => {
          item?.domain === project?.target
        })
        citaLength = cita?.length;
        sources = cita;
        sources = sources?.map((item) => ({ ...item, keyword: keyword }))
      }

      // citation count
      const citationsCount = slug === "llm_claude" ? annotations?.length : sources?.length;
      totalCitations += citationsCount;

      // domain matches
      let taskDomainMatches = 0;
      if (slug === "llm_claude") {
        taskDomainMatches = annotations.filter((s) => {
          try {
            const urlDomain = new URL(s.url).hostname.replace(/^www\./, "");
            const targetDomain = project.target.replace(/^www\./, "");
            return urlDomain === targetDomain;
          } catch (e) {
            return false;
          }
        }).length;
      } else {
        taskDomainMatches = sources.filter(
          (s) => s.title === project.target
        ).length;
      }
      domainMatches += taskDomainMatches;

      // push task result
      allResults.push({
        taskId: task._id,
        keyword,
        raw_results: slug === task.task_type === "llm_claude" ? allAnnotations : rawResults,
        citationsCount,
        domainMatches: taskDomainMatches,
      });
    }

    // 4. Send response
    res.json({
      message: "Tasks fetched successfully",
      data: {
        project: {
          id: project._id,
          target: project.target,
        },
        totalKeywords,
        totalCitations,
        domainMatches,
        tasks: allResults,
      },
    });
  } catch (error) {
    console.error("getLLMRankings error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getCompetitorsRankingsByDomain = async (req, res) => {
  try {
    const { slug } = req.params; // e.g. "llm_chatgpt", "llm_gemini" ...
    const { filters } = req.query;
    let parsedFilters = {};

    if (filters) {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (err) {
        return res.status(400).json({ error: "Invalid filters JSON" });
      }
    }

    const { project: projectId, startDate, endDate } = parsedFilters;
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required in filters" });
    }

    // Build query
    const query = { task_type: slug, project_id: projectId };
    if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Fetch project to validate
    const project = await LLM.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Fetch tasks (lean for performance)
    const tasks = await Task.find(query).lean();
    if (!tasks || tasks.length === 0) {
      return res.json({
        message: "No tasks found",
        data: {
          project: { id: project._id, target: project.target },
          totalTasks: 0,
          domains: [],
        },
      });
    }

    // Helpers & accumulators
    const normalizeDomain = (d) => {
      if (!d || typeof d !== "string") return null;
      return d.replace(/^www\./i, "").toLowerCase();
    };

    const domainCounts = {};        // domain => total occurrences
    const domainPositionSum = {};   // domain => sum of 1-based positions
    let totalTasks = 0;

    // For each task, extract ordered list of domains (in order of citations)
    for (const task of tasks) {
      totalTasks += 1;
      const rawResults = task.results || [];
      let domainsList = []; // ordered list of domains for this task (duplicates allowed)

      // Extract per-llm formats
      if (slug === "llm_chatgpt") {
        // previous code was using rawResults[0].items[2].sources => item.domain
        const sources = rawResults?.[0]?.items?.[2]?.sources || [];
        domainsList = sources
          .map((s) => (s && s.domain ? normalizeDomain(s.domain) : null))
          .filter(Boolean);
      } else if (slug === "llm_gemini") {
        // annotations[].title expected to be domain/title
        const annotations = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];
        domainsList = annotations
          .map((a) => (a && a.title ? normalizeDomain(a.title) : null))
          .filter(Boolean);
      } else if (slug === "llm_perplexity") {
        // annotations[].url -> hostname
        const annotations = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];
        domainsList = annotations
          .map((a) => {
            try {
              return a?.url ? normalizeDomain(new URL(a.url).hostname) : null;
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean);
      } else if (slug === "llm_claude") {
        // sections -> annotations with .url
        const sections = rawResults?.[0]?.items?.[0]?.sections || [];
        domainsList = sections
          .flatMap((sec) => (Array.isArray(sec?.annotations) ? sec.annotations : []))
          .map((ann) => {
            try {
              return ann?.url ? normalizeDomain(new URL(ann.url).hostname) : null;
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean);
      } else {
        // Fallback: try common shapes (sources / annotations)
        const possibleSources = rawResults?.[0]?.items?.[0]?.sources || rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];
        domainsList = (possibleSources || [])
          .map((s) => {
            if (s?.domain) return normalizeDomain(s.domain);
            if (s?.title) return normalizeDomain(s.title);
            if (s?.url) {
              try {
                return normalizeDomain(new URL(s.url).hostname);
              } catch (e) {
                return null;
              }
            }
            return null;
          })
          .filter(Boolean);
      }

      // For this task, increment counts and accumulate positions (1-based index)
      for (let i = 0; i < domainsList.length; i++) {
        const domain = domainsList[i];
        if (!domain) continue;

        // count
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;

        // positions sum (1-based)
        const pos = i + 1;
        domainPositionSum[domain] = (domainPositionSum[domain] || 0) + pos;
      }
    }

    // Build final array of domain stats
    const domains = Object.keys(domainCounts).map((domain) => {
      const count = domainCounts[domain] || 0;
      const posSum = domainPositionSum[domain] || 0;
      const avgPosition = count > 0 ? +(posSum / count).toFixed(2) : null;
      return {
        domain,
        count,
        averagePosition: avgPosition, // 1-based mean position across all occurrences
      };
    });

    // sort by count desc
    domains.sort((a, b) => b.count - a.count);

    return res.json({
      message: "Domain rankings fetched successfully",
      data: {
        project: { id: project._id, target: project.target },
        totalTasks,
        domains,
      },
    });
  } catch (err) {
    console.error("getCompetitorsRankingsByDomain error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getTotalCitations = async (req, res) => {
  try {
    // parse filters (same behaviour as your existing endpoint)
    const { filters } = req.query;
    let parsedFilters = {};
    if (filters) {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (err) {
        return res.status(400).json({ error: "Invalid filters JSON" });
      }
    }

    const startDate = parsedFilters.startDate || req.query.startDate;
    const endDate = parsedFilters.endDate || req.query.endDate;

    // Build base date filter (optional)
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Fetch all projects in LLM collection (only _id and target needed)
    const projects = await LLM.find({}, "_id target").lean();
    if (!Array.isArray(projects) || projects.length === 0) {
      return res.json({
        message: "No LLM projects found",
        data: { projectsCount: 0, totals: [] },
      });
    }

    const projectIds = projects.map((p) => p._id);

    // Find distinct slugs for tasks that belong to these projects (and optional date range)
    const slugQuery = { project_id: { $in: projectIds }, ...dateFilter };
    const slugs = await Task.distinct("task_type", slugQuery);

    if (!Array.isArray(slugs) || slugs.length === 0) {
      return res.json({
        message: "No tasks found for LLM projects",
        data: { projectsCount: projects.length, totals: [] },
      });
    }

    const totals = [];

    // iterate through each slug and aggregate
    for (const slug of slugs) {
      // fetch tasks for this slug and these projects (+date filter)
      const slugQuery = { project_id: { $in: projectIds }, task_type: slug, ...dateFilter };
      const tasks = await Task.find(slugQuery).lean();

      let totalKeywords = tasks.length;
      let totalCitations = 0;
      let domainMatches = 0;

      for (const task of tasks) {
        const rawResults = task.results || [];
        // find project meta for this task to compare domain if needed
        const projectForTask = projects.find((p) => String(p._id) === String(task.project_id));
        const projectTarget = projectForTask?.target || null;

        let sources = [];
        let annotations = [];

        if (slug === "llm_claude") {
          const sectionsWithAnnotations =
            rawResults?.[0]?.items?.[0]?.sections?.filter((item) => item.annotations != null) || [];
          annotations = sectionsWithAnnotations.flatMap((sec) =>
            Array.isArray(sec.annotations) ? sec.annotations : []
          );
        } else if (slug === "llm_gemini" || slug === "llm_perplexity") {
          annotations = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];
        } else {
          sources = rawResults?.[0]?.items?.[0]?.sources || [];
        }

        const citationsCount =
          (slug === "llm_claude" || slug === "llm_gemini" || slug === "llm_perplexity")
            ? (Array.isArray(annotations) ? annotations.length : 0)
            : (Array.isArray(sources) ? sources.length : 0);

        totalCitations += citationsCount;

        // domain matches (compare hostname for annotations or title for sources, per your prior logic)
        let taskDomainMatches = 0;
        if (slug === "llm_claude" || slug === "llm_gemini" || slug === "llm_perplexity") {
          if (Array.isArray(annotations) && projectTarget) {
            const targetHost = projectTarget.replace(/^www\./, "");
            taskDomainMatches = annotations.reduce((acc, a) => {
              try {
                const url = a.url || a.link || a.href || "";
                if (!url) return acc;
                const hostname = new URL(url).hostname.replace(/^www\./, "");
                return acc + (hostname === targetHost ? 1 : 0);
              } catch (e) {
                return acc;
              }
            }, 0);
          }
        } else {
          if (Array.isArray(sources) && projectTarget) {
            taskDomainMatches = sources.reduce((acc, s) => {
              try {
                const title = s.title || s.domain || s.url || "";
                return acc + (title === projectTarget ? 1 : 0);
              } catch (e) {
                return acc;
              }
            }, 0);
          }
        }

        domainMatches += taskDomainMatches;
      } // end for tasks

      totals.push({
        slug,
        totalKeywords,
        totalCitations,
        domainMatches,
      });
    } // end for slugs

    return res.json({
      message: "Totals calculated across all projects successfully",
      data: {
        projectsCount: projects.length,
        totals,
      },
    });
  } catch (err) {
    console.error("getTotalCitationsAllProjects error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const downloadLLMRanks = async (req, res) => {
  try {
    let parsedFilters = {};
    if (req.query.filters) {
      try {
        parsedFilters = JSON.parse(req.query.filters);
      } catch (e) {
        return res.status(400).json({ error: "Invalid filters" });
      }
    }
    const { projectId } = parsedFilters;

    // Fetch project and tasks like in your existing API
    const project = await LLM.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const targetDomain = project.target?.replace(/^www\./, "") || null;
    const tasks = await Task.find({ project_id: projectId }).lean();
    if (!tasks || tasks.length === 0)
      return res.status(404).json({ error: "No tasks found" });

    const llmTypes = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude"];
    const llmResults = {};

    for (const llm of llmTypes) {
      const tasksOfType = tasks.filter((t) => t.task_type === llm);
      const resultsPerLLM = [];

      for (const task of tasksOfType) {
        const rawResults = task.results || [];
        let citations = [];
        let allCitations = [];
        let rank = null;
        let url = null;
        let markdown = null

        // --- REUSE your existing LLM extraction logic ---
        switch (llm) {
          // case "llm_chatgpt":
          //   const sources = rawResults?.[0]?.items?.[2]?.sources || [];
          //   allCitations =
          //     rawResults?.[0]?.items?.[2]?.sources?.map((item) =>
          //       item.domain ? item.domain.replace(/^www\./, "") : null
          //     ).filter(Boolean) || [];

          //   if (targetDomain) {
          //     const normalizedTarget = targetDomain.replace(/^www\./, "");
          //     citations = allCitations.filter((domain) => domain === normalizedTarget);
          //     const index = rawResults?.[0]?.items?.[2]?.sources?.findIndex(
          //       (item) => {
          //         item.domain?.replace(/^www\./, "") === normalizedTarget

          //       }
          //     );
          //     rank = index >= 0 ? index + 1 : null;

          //     url = rank > 0 ? sources[index].url || null : null;
          //   }
          //   break;

          case "llm_chatgpt":
            const annotations2 = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];

            allCitations =
              rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations?.map((item) =>
                item.url ? new URL(item.url).hostname.replace(/^www\./, "") : null
              ).filter(Boolean) || [];

            if (targetDomain) {
              const normalizedTarget = targetDomain.replace(/^www\./, "");

              // filter citations to only matching domains
              citations = allCitations.filter((domain) => domain === normalizedTarget);

              // compute rank from original list
              const originalList =
                rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations?.map((item) =>
                  item.url ? new URL(item.url).hostname.replace(/^www\./, "") : null
                ).filter(Boolean) || [];

              const index = originalList.findIndex((d) => d === normalizedTarget);
              rank = index >= 0 ? index + 1 : null;
              url = rank > 0 ? annotations2[index].url || null : null;
            }
            break;

          case "llm_gemini":
            const annotations = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];

            allCitations =
              rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations?.map((item) =>
                item.title ? item.title : null
              ).filter(Boolean) || [];

            if (targetDomain) {
              const normalizedTarget = targetDomain.replace(/^www\./, "");
              citations = allCitations.filter((domain) => domain === normalizedTarget);

              const originalList =
                rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations?.map((item) => {
                  return item.title ? item.title : null
                }
                )
              const index = originalList?.findIndex((d) => d === normalizedTarget);
              rank = index >= 0 ? index + 1 : null;
              url = rank > 0 ? annotations[index].url || null : null;

            }
            break;

          case "llm_perplexity":
            const annotations1 = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];

            allCitations =
              rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations?.map((item) =>
                item.url ? new URL(item.url).hostname.replace(/^www\./, "") : null
              ).filter(Boolean) || [];

            if (targetDomain) {
              const normalizedTarget = targetDomain.replace(/^www\./, "");

              // filter citations to only matching domains
              citations = allCitations.filter((domain) => domain === normalizedTarget);

              // compute rank from original list
              const originalList =
                rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations?.map((item) =>
                  item.url ? new URL(item.url).hostname.replace(/^www\./, "") : null
                ).filter(Boolean) || [];

              const index = originalList.findIndex((d) => d === normalizedTarget);
              rank = index >= 0 ? index + 1 : null;
              url = rank > 0 ? annotations1[index].url || null : null;

            }
            break;

          case "llm_claude": {
            const annotations =
              rawResults?.[0]?.items?.[0]?.sections?.flatMap((sec) =>
                sec?.annotations || []
              ) || [];
            allCitations =
              rawResults?.[0]?.items?.[0]?.sections?.flatMap((sec) => {
                if (!sec || !Array.isArray(sec.annotations)) return [];
                return sec.annotations
                  .map((ann) => {
                    try {
                      if (!ann || !ann.url) return null;
                      return new URL(ann.url).hostname.replace(/^www\./, "");
                    } catch (e) {
                      return null;
                    }
                  })
                  .filter(Boolean);
              }) || [];

            if (targetDomain) {
              const normalizedTarget = targetDomain.replace(/^www\./, "");
              citations = allCitations.filter((domain) => domain === normalizedTarget);
              const index = allCitations.findIndex((d) => d === normalizedTarget);
              rank = index >= 0 ? index + 1 : null;
              url = rank > 0 ? annotations[index].url || null : null;

            } else {
              citations = [...allCitations];
            }
            break;
          }

          default:
            citations = [];
            allCitations = [];
            rank = null;
            url = null;
            markdown = null
        }

        resultsPerLLM.push({
          Prompt: safeDecode(task.keyword) || "",
          Rank: rank !== null ? rank : "No rank",
          "Total Mentions": citations.length || 0,
          URL: url || "",
          markdown: markdown || ""
        });
      }

      llmResults[llm] = resultsPerLLM;
    }

    // Create workbook
    const workbook = xlsx.utils.book_new();

    for (const [llm, results] of Object.entries(llmResults)) {
      const sheet = xlsx.utils.json_to_sheet(results);
      const sheetName = llm.replace("llm_", "").toUpperCase(); // CHATGPT, GEMINI, etc.
      xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
    }

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Send as download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="LLM_Ranks.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
  } catch (err) {
    console.error("downloadLLMRanks error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/// LLM Dashboard api

const BRAND_KEYWORD = "bajaj finserv";
const TOP_KEYWORDS_LIMIT = 5;
const TOP_URLS_LIMIT = 5;
const TOP_RANKS = ["1", "2", "3", "4"];

const extractBrandFromDomain = (domain) => {
  if (!domain) return null;
  const parts = domain.split('.');
  if (parts.length <= 2) {
    // e.g. icicibank.com, bajajfinserv.in
    return parts[0];
  }
  // e.g. personal-banking.icicibank.com -> icicibank
  return parts[parts.length - 2];
};


const isDateInRange = (date, start, end) => date >= start && date <= end;

const normalizeRankBucket = (rank) => {
  const r = Number(rank);
  if (!Number.isFinite(r) || r <= 0) return null;
  return r <= 4 ? String(r) : "5+";
};

const normalizeDomain = (value) => {
  if (!value) return null;

  let input = String(value).trim().toLowerCase();

  // Add scheme if missing so URL() doesn't throw
  if (!/^https?:\/\//.test(input)) {
    input = `https://${input}`;
  }

  try {
    const { hostname } = new URL(input);
    return hostname.replace(/^www\./, '');
  } catch (e) {
    // Fallback: defensive parsing
    return String(value)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .replace(/^www\./, '') || null;
  }
};

const normalizeUrl = (value) => {
  if (!value) return null;

  let input = String(value).trim();

  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`;
  }

  try {
    const url = new URL(input);
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch (e) {
    return null;
  }
};

// Class for managing rank statistics
class RankAccumulator {
  constructor() {
    this.ranksCount = {};
    this.ranksUrls = {};
    this.totalMatches = 0;
    this.domainStats = {};
  }

  register(domain, rank, url) {
    const r = Number(rank);
    if (!Number.isFinite(r) || r <= 0) return;

    this.ranksCount[r] = (this.ranksCount[r] || 0) + 1;
    if (!this.ranksUrls[r]) this.ranksUrls[r] = new Set();
    if (url) this.ranksUrls[r].add(url);
    this.totalMatches += 1;

    if (!this.domainStats[domain]) {
      this.domainStats[domain] = { occurrences: 0, sumRanks: 0, urls: new Set() };
    }
    this.domainStats[domain].occurrences += 1;
    this.domainStats[domain].sumRanks += r;
    if (url) this.domainStats[domain].urls.add(url);
  }

  getRankSummary() {
    if (this.totalMatches === 0) return {};

    const normalizedRanks = {};
    for (const [rankStr, count] of Object.entries(this.ranksCount)) {
      const bucket = Number(rankStr) <= 4 ? rankStr : "5+";
      normalizedRanks[bucket] = (normalizedRanks[bucket] || 0) + count;
    }

    const summary = {};
    for (const rank of TOP_RANKS) {
      const count = normalizedRanks[rank] || 0;
      const urlsSet = this.ranksUrls[rank] || new Set();

      summary[rank] = {
        rank: rank === "5+" ? "5+" : Number(rank),
        count,
        percentage: Math.round((count / this.totalMatches) * 100),
        urlCount: urlsSet.size,
        urls: Array.from(urlsSet),
      };
    }

    return summary;
  }

  getDomainStats() {
    const stats = {};
    for (const [domain, acc] of Object.entries(this.domainStats)) {
      stats[domain] = {
        occurrences: acc.occurrences,
        avgRank: acc.occurrences > 0 ? Number((acc.sumRanks / acc.occurrences).toFixed(2)) : null,
        uniqueUrlCount: acc.urls.size,
        urls: Array.from(acc.urls),
      };
    }
    return stats;
  }
}

function normalizeString(str) {
  return str.toLowerCase().replace(/[\s\-_]/g, '');
}

class CitationExtractor {
  // --- Rank based on brand appearance order in text ---
  static findBrandRankInText(text, targetDomain, fixedCompetitors, brandName) {
    if (!text || !targetDomain || !brandName) return null;

    const normalizedText = normalizeString(text); // your existing helper

    // We still use brandName as canonical brand label
    const targetNormalized = normalizeString(brandName);

    const allBrands = Object.values(fixedCompetitors).map(c => ({
      brand: c.brand,
      normalized: c.brand.toLowerCase().replace(/\s+/g, '')
    }));

    const brandPositions = [];

    for (const competitor of allBrands) {
      const normalizedBrand = competitor.normalized;
      const index = normalizedText.indexOf(normalizedBrand);
      if (index !== -1) {
        brandPositions.push({
          brand: competitor.brand,
          normalized: competitor.normalized,
          position: index
        });
      }
    }

    if (brandPositions.length === 0) return null;

    brandPositions.sort((a, b) => a.position - b.position);

    const seen = new Set();
    const uniqueBrands = [];
    for (const item of brandPositions) {
      const norm = item.brand.toLowerCase().replace(/\s+/g, '');
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueBrands.push(item);
      }
    }

    const rank = uniqueBrands.findIndex(item => {
      const itemNorm = item.brand.toLowerCase().replace(/\s+/g, '');
      return (
        itemNorm.includes(targetNormalized) ||
        targetNormalized.includes(itemNorm)
      );
    });

    return rank >= 0 ? rank + 1 : null;
  }

  static extractChatGPT(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const text = rawResults.length > 1
      ? rawResults?.[1]?.content[0]?.text || ""
      : rawResults?.[0]?.items?.[0]?.sections?.[0]?.text || ""

    const brandVisible = text.toLowerCase().includes(BRAND_KEYWORD);

    const annotations = rawResults.length > 1
      ? rawResults?.[1]?.content[0]?.annotations || []
      : rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || []

    const annotationUrls = annotations.length > 0 ? annotations
      .map(item => item.url)
      .filter(Boolean) : [];


    const textMentionUrls = extractDomainMentionsFromText(text, targetDomain);
    // const allUrls = [...new Set([...annotationUrls, ...textMentionUrls])];

    const allUrls = [
      ...new Set(
        [...annotationUrls, ...textMentionUrls]
          .map(normalizeToHttpsWww)
          .filter(Boolean)
      ),
    ];

    const allCitations = annotations.length > 0 ? annotations
      .map(item => normalizeDomain(item.url))
      .filter(Boolean) : [];

    let citations = [];
    let rank = null;
    let url = null;
    let domain = null;

    if (targetDomain) {
      const normalized = normalizeDomain(targetDomain);
      citations = allCitations?.filter(d => d === normalized);

      const firstIndex = allCitations.findIndex(d => d === normalized);
      if (firstIndex >= 0) {
        url = annotations[firstIndex]?.url || null;
        domain = normalizeDomain(annotations[firstIndex]?.url) || null;
      }
    }

    // Rank by brand appearance in text
    if (text && targetDomain && fixedCompetitors && brandName) {
      rank = this.findBrandRankInText(
        text,
        targetDomain,
        fixedCompetitors,
        brandName
      );
    }

    // --- My pages cited: unique pages of my domain ---
    const myDomain = normalizeDomain(targetDomain || null);
    let matchedUrls = [];
    let myPagesCited = 0;

    if (myDomain) {
      matchedUrls = allUrls.filter(u => normalizeDomain(u) === myDomain);

      const uniqueNormalizedPages = new Set(
        matchedUrls.map(normalizeUrl).filter(Boolean)
      );
      myPagesCited = uniqueNormalizedPages.size;
    }

    return {
      citations,
      allCitations,
      rank,
      url,
      domain,
      brandVisible,
      allUrls,
      text,
      matchedUrls,
      myPagesCited
    };
  }

  // ---------- Gemini ----------
  static extractGemini(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const annotations = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];
    const text = rawResults?.[0]?.items?.[0]?.sections?.[0]?.text || "";

    const annotationUrls = annotations
      .map(item => item.url)
      .filter(Boolean);

    const textMentionUrls = extractDomainMentionsFromText(text, targetDomain);
    const allUrls = [...new Set([...annotationUrls, ...textMentionUrls])];

    // const allUrls = [
    //   ...new Set(
    //     [...annotationUrls, ...textMentionUrls]
    //       .map(normalizeToHttpsWww)
    //       .filter(Boolean)
    //   ),
    // ];

    const brandVisible = text.toLowerCase().includes(BRAND_KEYWORD);

    // For Gemini we stored titles in allCitations (domains)
    const allCitations = annotations
      .map(item => item.title)
      .filter(Boolean);

    let citations = [];
    let rank = null;
    let url = null;
    let domain = null;

    if (targetDomain) {
      const normalized = normalizeDomain(targetDomain);
      citations = allCitations.filter(d => normalizeDomain(d) === normalized);

      const firstIndex = allCitations.findIndex(d => normalizeDomain(d) === normalized);
      if (firstIndex >= 0) {
        url = annotations[firstIndex]?.url || null;
        domain = annotations[firstIndex]?.title || null;
      }
    }

    if (text && targetDomain && fixedCompetitors && brandName) {
      rank = this.findBrandRankInText(
        text,
        targetDomain,
        fixedCompetitors,
        brandName
      );
    }

    const myDomain = normalizeDomain(targetDomain || null);
    let matchedUrls = [];
    let myPagesCited = 0;

    if (myDomain) {
      matchedUrls = allUrls.filter(u => normalizeDomain(u) === myDomain);

      const uniqueNormalizedPages = new Set(
        matchedUrls.map(normalizeUrl).filter(Boolean)
      );
      myPagesCited = uniqueNormalizedPages.size;
    }

    return {
      citations,
      allCitations,
      rank,
      url,
      domain,
      brandVisible,
      allUrls,
      text,
      matchedUrls,
      myPagesCited
    };
  }

  // ---------- Perplexity ----------
  static extractPerplexity(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const text = rawResults?.[0]?.items?.[0]?.sections?.[0]?.text || "";
    const brandVisible = text.toLowerCase().includes(BRAND_KEYWORD);

    const annotations = rawResults?.[0]?.items?.[0]?.sections?.[0]?.annotations || [];

    const annotationUrls = annotations
      .map(item => item.url)
      .filter(Boolean);

    const textMentionUrls = extractDomainMentionsFromText(text, targetDomain);
    // const allUrls = [...new Set([...annotationUrls, ...textMentionUrls])];

    const allUrls = [
      ...new Set(
        [...annotationUrls, ...textMentionUrls]
          .map(normalizeToHttpsWww)
          .filter(Boolean)
      ),
    ];

    const allCitations = annotations
      .map(item => normalizeDomain(item.url))
      .filter(Boolean);

    let citations = [];
    let rank = null;
    let url = null;
    let domain = null;

    if (targetDomain) {
      const normalized = normalizeDomain(targetDomain);
      citations = allCitations.filter(d => d === normalized);

      const firstIndex = allCitations.findIndex(d => d === normalized);
      if (firstIndex >= 0) {
        url = annotations[firstIndex]?.url || null;
        domain = normalizeDomain(annotations[firstIndex]?.url) || null;
      }
    }

    if (text && targetDomain && fixedCompetitors && brandName) {
      rank = this.findBrandRankInText(
        text,
        targetDomain,
        fixedCompetitors,
        brandName
      );
    }

    const myDomain = normalizeDomain(targetDomain || null);
    let matchedUrls = [];
    let myPagesCited = 0;

    if (myDomain) {
      matchedUrls = allUrls.filter(u => normalizeDomain(u) === myDomain);

      const uniqueNormalizedPages = new Set(
        matchedUrls.map(normalizeUrl).filter(Boolean)
      );
      myPagesCited = uniqueNormalizedPages.size;
    }

    return {
      citations,
      allCitations,
      rank,
      url,
      domain,
      brandVisible,
      allUrls,
      text,
      matchedUrls,
      myPagesCited
    };
  }

  // ---------- Claude ----------
  static extractClaude(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const sections = rawResults?.[0]?.items?.[0]?.sections || [];

    const text = sections.map(sec => sec?.text || "").join(" ");
    const brandVisible = text.toLowerCase().includes(BRAND_KEYWORD);

    const annotations = sections.flatMap(sec => sec?.annotations || []);

    const annotationUrls = sections.flatMap(sec => {
      if (!sec || !Array.isArray(sec.annotations)) return [];
      return sec.annotations
        .map(ann => ann?.url)
        .filter(Boolean);
    });

    const textMentionUrls = extractDomainMentionsFromText(text, targetDomain);
    // const allUrls = [...new Set([...annotationUrls, ...textMentionUrls])];

    const allUrls = [
      ...new Set(
        [...annotationUrls, ...textMentionUrls]
          .map(normalizeToHttpsWww)
          .filter(Boolean)
      ),
    ];

    const allCitations = sections.flatMap(sec => {
      if (!sec || !Array.isArray(sec.annotations)) return [];
      return sec.annotations
        .map(ann => normalizeDomain(ann?.url))
        .filter(Boolean);
    });

    let citations = [];
    let rank = null;
    let url = null;
    let domain = null;

    if (targetDomain) {
      const normalized = normalizeDomain(targetDomain);
      citations = allCitations.filter(d => d === normalized);

      const firstIndex = allCitations.findIndex(d => d === normalized);
      if (firstIndex >= 0) {
        url = annotations[firstIndex]?.url || null;
        // Claude doesn't always give title, so we'll keep domain from URL
        domain = normalizeDomain(annotations[firstIndex]?.url) || null;
      }
    } else {
      citations = [...allCitations];
    }

    if (text && targetDomain && fixedCompetitors && brandName) {
      rank = this.findBrandRankInText(
        text,
        targetDomain,
        fixedCompetitors,
        brandName
      );
    }

    const myDomain = normalizeDomain(targetDomain || null);
    let matchedUrls = [];
    let myPagesCited = 0;

    if (myDomain) {
      matchedUrls = allUrls.filter(u => normalizeDomain(u) === myDomain);

      const uniqueNormalizedPages = new Set(
        matchedUrls.map(normalizeUrl).filter(Boolean)
      );
      myPagesCited = uniqueNormalizedPages.size;
    }

    return {
      citations,
      allCitations,
      rank,
      url,
      domain,
      brandVisible,
      allUrls,
      text,
      matchedUrls,
      myPagesCited
    };
  }

  // ---------- AI Overview / AI Mode ----------
  static extractAIMode(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const text = rawResults?.[0]?.items?.[0]?.markdown || "";
    const brandVisible = text.toLowerCase().includes(BRAND_KEYWORD);

    const annotations = rawResults?.[0]?.items?.[0]?.references || [];

    const annotationUrls = annotations
      .map(item => item.url)
      .filter(Boolean);

    const textMentionUrls = extractDomainMentionsFromText(text, targetDomain);
    // const allUrls = [...new Set([...annotationUrls, ...textMentionUrls])];

    const allUrls = [
      ...new Set(
        [...annotationUrls, ...textMentionUrls]
          .map(normalizeToHttpsWww)
          .filter(Boolean)
      ),
    ];

    const allCitations = annotations
      .map(item => item.domain)
      .filter(Boolean);

    let citations = [];
    let rank = null;
    let url = null;
    let domain = null;

    if (targetDomain) {
      const normalized = normalizeDomain(targetDomain);
      citations = allCitations.filter(d => normalizeDomain(d) === normalized);

      const firstIndex = allCitations.findIndex(d => normalizeDomain(d) === normalized);
      if (firstIndex >= 0) {
        url = annotations[firstIndex]?.url || null;
        domain = annotations[firstIndex]?.domain || null;
      }
    }

    if (text && targetDomain && fixedCompetitors && brandName) {
      rank = this.findBrandRankInText(
        text,
        targetDomain,
        fixedCompetitors,
        brandName
      );
    }

    const myDomain = normalizeDomain(targetDomain || null);
    let matchedUrls = [];
    let myPagesCited = 0;

    if (myDomain) {
      matchedUrls = allUrls.filter(u => normalizeDomain(u) === myDomain);

      const uniqueNormalizedPages = new Set(
        matchedUrls.map(normalizeUrl).filter(Boolean)
      );
      myPagesCited = uniqueNormalizedPages.size;
    }

    return {
      citations,
      allCitations,
      rank,
      url,
      domain,
      brandVisible,
      allUrls,
      text,
      matchedUrls,
      myPagesCited
    };
  }

  // ---------- Main dispatcher ----------
  static extract(llmType, brandName, fixedCompetitors, rawResults, targetDomain) {
    switch (llmType) {
      case "llm_chatgpt":
        return this.extractChatGPT(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_gemini":
        return this.extractGemini(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_perplexity":
        return this.extractPerplexity(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_claude":
        return this.extractClaude(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_aiMode":
        return this.extractAIMode(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      default:
        return {
          citations: [],
          allCitations: [],
          rank: null,
          url: null,
          domain: null,
          brandVisible: false,
          allUrls: [],
          text: "",
          matchedUrls: [],
          myPagesCited: 0
        };
    }
  }
}


// Data Aggregators
class TimelineAggregator {
  constructor(fixedCompetitors) {
    this.visibility = {};
    this.competitors = {};
    this.llmVisibility = {};

    for (const competitor of Object.values(fixedCompetitors)) {
      this.competitors[competitor.brand] = {};
    }
  }

  addVisibility(dateKey, count) {
    this.visibility[dateKey] = (this.visibility[dateKey] || 0) + count;
  }

  addCompetitor(brand, dateKey) {
    if (!this.competitors[brand]) this.competitors[brand] = {};
    this.competitors[brand][dateKey] = (this.competitors[brand][dateKey] || 0) + 1;
  }

  addLLMVisibility(llmName, dateKey, count) {
    if (!this.llmVisibility[llmName]) this.llmVisibility[llmName] = {};
    this.llmVisibility[llmName][dateKey] = (this.llmVisibility[llmName][dateKey] || 0) + count;
  }
}

class CompetitorAnalyzer {
  constructor(timeline, fixedCompetitors) {
    this.timeline = timeline;
    this.fixedCompetitors = fixedCompetitors;
    this.counts = {};

    for (const competitor of Object.values(fixedCompetitors)) {
      this.counts[competitor.brand] = 0;
    }
  }

  addMention(brand) {
    if (this.counts.hasOwnProperty(brand)) {
      this.counts[brand] = (this.counts[brand] || 0) + 1;
    }
  }

  getFixedCompetitors() {
    return Object.entries(this.counts).map(([brand, mentions]) => ({
      brand,
      mentions,
      domain: this.fixedCompetitors[brand]?.domain || null
    }));
  }

  calculatePercentages(totalTasksPerDate) {
    const percentages = {};

    for (const [brand, mentions] of Object.entries(this.counts)) {
      percentages[brand] = {};

      for (const [date, totalTasks] of Object.entries(totalTasksPerDate)) {
        const competitorMentionsOnDate = this.timeline[brand]?.[date] || 0;
        const percent = totalTasks > 0
          ? ((competitorMentionsOnDate / totalTasks) * 100).toFixed(2)
          : 0;
        percentages[brand][date] = percent;
      }
    }

    return percentages;
  }
}

class BrandMentionDetector {
  constructor(fixedCompetitors) {
    this.fixedCompetitors = fixedCompetitors;
  }

  findFixedCompetitorMentions(text) {
    if (!text) return [];

    const lowerText = text.toLowerCase();
    const mentionedBrands = [];

    for (const competitor of Object.values(this.fixedCompetitors)) {
      const brandName = competitor.brand.toLowerCase();
      // const brandName = competitor.brand
      // const domainBrand = extractBrandFromDomain(competitor.domain)?.toLowerCase();

      // if (lowerText.includes(brandName) 
      // (domainBrand && lowerText.includes(domainBrand))) {
      if (brandName && lowerText.includes(brandName)) {
        mentionedBrands.push(competitor.brand);
      }
    }

    return mentionedBrands;
  }

  isTargetBrandMentioned(text, targetDomain, brandName) {
    if (!text || !targetDomain || !brandName) return false;

    const brand = extractBrandFromDomain(targetDomain);
    if (!brand) return false;
    const normalizedText = text.toLowerCase();
    return normalizedText.includes(brandName.toLowerCase());
  }
}

function normalizeToHttpsWww(input) {
  if (!input || typeof input !== "string") return null;

  let url = input.trim();

  try {
    // Add protocol if missing
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }

    const parsed = new URL(url);

    // Force https
    parsed.protocol = "https:";

    // Normalize hostname (lowercase + force www)
    let hostname = parsed.hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, "");
    parsed.hostname = "www." + hostname;

    // Remove default ports
    if (parsed.port === "443" || parsed.port === "80") {
      parsed.port = "";
    }

    // Normalize pathname
    parsed.pathname = parsed.pathname
      .replace(/\/+$/, "") || "/";

    // OPTIONAL (recommended): remove tracking noise
    parsed.search = "";
    parsed.hash = "";

    return parsed.href;
  } catch {
    return null;
  }
}

function extractDomainMentionsFromText(text, targetDomain) {
  if (!text || !targetDomain) return [];

  const normalizedDomain = targetDomain.replace(/^www\./, "").toLowerCase();
  const escapedDomain = normalizedDomain.replace(/\./g, "\\.");
  const mentions = [];

  // Stop at whitespace OR ) OR ] OR >
  const tail = `[^\\s\\)\\]\\>]*`;

  const patterns = [
    // https://example.com/...
    new RegExp(`https?://(?:www\\.)?${escapedDomain}${tail}`, "gi"),
    // www.example.com/...
    new RegExp(`www\\.${escapedDomain}${tail}`, "gi"),
    // bare example.com/...
    new RegExp(`(?:^|\\s)${escapedDomain}${tail}`, "gi"),
  ];

  patterns.forEach((pattern) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      let foundUrl = match[0].trim();

      // remove leading space from the 3rd pattern
      foundUrl = foundUrl.replace(/^\s+/, "");

      // Add protocol if missing
      if (!foundUrl.startsWith("http")) {
        foundUrl = "https://" + foundUrl.replace(/^www\./, "");
      }

      // Strip common trailing punctuation: ), ], ., , ; : ! ?
      foundUrl = foundUrl.replace(/[\)\]\.,;:!?]+$/, "");

      mentions.push(foundUrl);
    }
  });

  return [...new Set(mentions)];
}

const getLLMCitationsAndRanks = async (req, res) => {
  try {
    const { filters } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const { projectId, platforms, startDate, endDate, selectedDate } = parsedFilters;

    // ✅ Find project
    const project = await LLM.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectCompetitors = project.competitors || [];

    const mainProject = {
      brand: project.brand,
      domain: project.target.toLowerCase()
    };

    const fixedCompetitors = [
      mainProject,
      ...projectCompetitors
    ].reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain
      };
      return acc;
    }, {});

    const targetDomainRaw = project.target || null;
    const targetDomain = normalizeDomain(targetDomainRaw);
    const brandName = project?.brand || null;

    // ✅ Build Mongo query
    const query = { project_id: projectId };

    if (selectedDate) {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      query.created_at = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // ✅ Fetch tasks
    const tasks = await Task.find(query).lean();
    if (!tasks || tasks.length === 0) {
      return res.json({ message: "No tasks found", data: {} });
    }

    // ✅ Find latest date across all tasks
    const latestDate = new Date(Math.max(...tasks.map(t => new Date(t.created_at))));
    const latestDateKey = latestDate.toISOString().split("T")[0];

    const llmResults = {};
    const brandVisibility = [];
    const timeline = new TimelineAggregator(fixedCompetitors);
    const competitor = new CompetitorAnalyzer(timeline.competitors, fixedCompetitors);
    const rankAcc = new RankAccumulator();
    const brandDetector = new BrandMentionDetector(fixedCompetitors);

    const totalUrlsSet = new Set();          // all unique URLs on latest date
    const totalMatchedUrlsSet = new Set();   // unique URLs on latest date that belong to my domain
    let totalUrlsCount = 0;

    const ALL_LLM_TYPES = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude", "llm_aiMode"];
    const platformMap = {
      chatgpt: "llm_chatgpt",
      gemini: "llm_gemini",
      perplexity: "llm_perplexity",
      claude: "llm_claude",
      ai_overview: "llm_aiMode"
    };

    const LLM_TYPES = (platforms && platforms.length > 0)
      ? platforms.map(p => platformMap[p]).filter(Boolean)
      : ALL_LLM_TYPES;

    const totalTasksPerDate = {};

    // ✅ Process each LLM type separately
    for (const llmType of LLM_TYPES) {
      const llmName = llmType.replace("llm_", "");
      const tasksOfType = tasks.filter(t => t.task_type === llmType);
      if (!tasksOfType.length) continue;

      const resultsPerLLM = [];
      let visibilityCount = 0;

      for (const task of tasksOfType) {
        const taskDate = new Date(task.created_at);
        const dateKey = taskDate.toISOString().split("T")[0];

        const extracted = CitationExtractor.extract(
          llmType,
          brandName,
          fixedCompetitors,
          task.results || [],
          targetDomainRaw || null
        );

        if (!extracted) continue;

        const {
          citations,
          allCitations,
          rank,
          url,
          domain,
          brandVisible,
          allUrls,
          text,
          myPagesCited,
          matchedUrls
        } = extracted;

        const isLatestDate = dateKey === latestDateKey;

        // ✅ Count only latest date data for URL metrics
        if (isLatestDate) {
          // Unique matched URLs for my domain
          const normalizedMatched = matchedUrls
            .map(normalizeUrl)
            .filter(Boolean);

          normalizedMatched.forEach(u => totalMatchedUrlsSet.add(u));

          // Unique URLs overall (any domain)
          const normalizedUrls = allUrls
            .map(normalizeUrl)
            .filter(Boolean);

          const uniqueUrls = [...new Set(normalizedUrls)];
          uniqueUrls.forEach(u => totalUrlsSet.add(u));
          totalUrlsCount += uniqueUrls.length;
        }

        const targetBrandMentioned = brandDetector.isTargetBrandMentioned(
          text,
          targetDomain,
          brandName
        );

        // ✅ Chart data: uses all dates
        totalTasksPerDate[dateKey] = (totalTasksPerDate[dateKey] || 0) + 1;

        if (targetBrandMentioned) {
          timeline.addVisibility(dateKey, 1);
          timeline.addLLMVisibility(llmName, dateKey, 1);
        }

        const mentionedBrands = brandDetector.findFixedCompetitorMentions(text);

        mentionedBrands.forEach(brand => {
          timeline.addCompetitor(brand, dateKey);
        });

        // ✅ Latest date metrics (ranks, competitor mentions, etc.)
        if (isLatestDate) {
          if (targetBrandMentioned) {
            visibilityCount++;

            const textBasedRank = CitationExtractor.findBrandRankInText(
              text,
              targetDomain,
              fixedCompetitors,
              brandName
            );

            const finalRank = textBasedRank || rank || "uncited";
            const keyword = safeDecode(task.data?.user_prompt || "");

            rankAcc.register(
              targetDomain,
              finalRank,
              task._id,
              text,
              keyword,
              url
            );
          }

          mentionedBrands.forEach(brand => {
            competitor.addMention(brand);
          });

          resultsPerLLM.push({
            taskId: task._id,
            keyword: safeDecode(task.data.user_prompt),
            citations,
            rank,
            url,
            text,
            domain,
            taskDate: taskDate.toISOString(),
            mentionedBrands,
            matchedUrls
          });
        }
      }

      brandVisibility.push({ llm: llmName, visibilityCount });
      llmResults[llmType] = resultsPerLLM;
    }

    const fixedCompetitorsData = competitor.getFixedCompetitors();

    // ✅ Chart data (all dates)
    const competitorPercentages = competitor.calculatePercentages(totalTasksPerDate);
    const llmPercentages = calculateLLMPercentages(timeline.llmVisibility, llmResults);

    // ✅ Latest date data only
    const topUrlKeywordData = getTopUrlKeywordData(llmResults, TOP_URLS_LIMIT);
    const topKeywords = getTopKeywords(
      llmResults,
      TOP_KEYWORDS_LIMIT,
      targetDomain,
      fixedCompetitors,
      brandName
    );

    const rankSummary = rankAcc.getRankSummary();
    const totalBrandVisibility = brandVisibility.reduce((sum, item) => sum + item.visibilityCount, 0);
    const rankSummaryTotal = Object.values(rankSummary).reduce((sum, r) => sum + r.count, 0);

    if (rankSummaryTotal !== totalBrandVisibility) {
      console.warn(
        `Rank summary total (${rankSummaryTotal}) doesn't match brand visibility total (${totalBrandVisibility})`
      );
    }

    const fullData = {
      projectId,
      targetDomain,
      latestDate: latestDateKey,
      llmResults,

      // Chart data
      visibilityTimeline: timeline.visibility,
      competitorTimeline: timeline.competitors,
      competitorPercentages,
      llmPercentages,
      llmVisibilityTimeline: timeline.llmVisibility,

      // Latest date stats
      fixedCompetitors: fixedCompetitorsData,
      brand_visibility: brandVisibility,
      rankSummary,
      rankSummaryTotal,
      domainRankStats: rankAcc.getDomainStats(),
      topUrlKeywordData,
      topKeywords,
      totalUrlsCount,
      uniqueUrlsCount: totalUrlsSet.size,

      // ✅ Final "my pages cited" = unique pages of my domain on latest date
      myPagesCited: totalMatchedUrlsSet.size,
    };

    return res.json({
      message: "Citations and ranks fetched successfully",
      data: fullData,
    });

  } catch (err) {
    console.error("getLLMCitationsAndRanks error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

function calculateLLMPercentages(llmVisibilityTimeline, llmResults) {
  const percentages = {};

  for (const [llmName, timeline] of Object.entries(llmVisibilityTimeline)) {
    percentages[llmName] = {};

    const llmTypeKey = `llm_${llmName}`;
    const totalCountForLLM = llmResults[llmTypeKey]
      ? llmResults[llmTypeKey].length
      : 0;

    for (const [date, count] of Object.entries(timeline)) {
      percentages[llmName][date] =
        totalCountForLLM > 0
          ? Math.round((count / totalCountForLLM) * 100)
          : 0;
    }
  }

  return percentages;
}

function getTopUrlKeywordData(llmResults, limit) {
  const urlCounts = {};

  for (const results of Object.values(llmResults)) {
    results.forEach(res => {
      if (res.url) {
        urlCounts[res.url] = (urlCounts[res.url] || 0) + 1;
      }
    });
  }

  const topUrls = Object.entries(urlCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url]) => url);

  return topUrls.map(url => {
    const keywordEntries = [];

    for (const [llmType, results] of Object.entries(llmResults)) {
      results.forEach(res => {
        if (res.url === url) {
          let markdownFiltered = "";
          if (res.keyword && res.markdown) {
            markdownFiltered = res.markdown
              .split("\n")
              .filter(line => line.toLowerCase().includes(res.keyword.toLowerCase()))
              .join("\n");
          }

          keywordEntries.push({
            keyword: res.keyword,
            markdown: markdownFiltered || res.markdown || "",
            llm: llmType.replace("llm_", ""),
          });
        }
      });
    }

    return { url, keywords: keywordEntries };
  });
}

function getTopKeywords(llmResults, limit, targetDomain, fixedCompetitors, brandName) {
  const keywordCounts = {};
  const brandDetector = new BrandMentionDetector(fixedCompetitors);
  const llmCount = Object.keys(llmResults).length;

  for (const [llmType, results] of Object.entries(llmResults)) {
    results.forEach(res => {
      const keyword = res.keyword;
      if (!keyword || !res.text) return;

      if (!keywordCounts[keyword]) {
        keywordCounts[keyword] = {
          taskCount: 0,
          llmSet: new Set(),
          brandMentionLLMs: new Set()
        };
      }

      keywordCounts[keyword].taskCount += 1;
      keywordCounts[keyword].llmSet.add(llmType);

      // ✅ Detect brand mention for target domain
      const brandMentioned = brandDetector.isTargetBrandMentioned(res.text, targetDomain, brandName);
      if (brandMentioned) {
        keywordCounts[keyword].brandMentionLLMs.add(llmType);
      }
    });
  }

  return Object.entries(keywordCounts)
    .map(([keyword, data]) => ({
      keyword,
      answers: data.brandMentionLLMs.size,
      visibility: Math.round((data.brandMentionLLMs.size / llmCount) * 100),
    }))
    .sort((a, b) =>
      b.visibility - a.visibility ||
      b.answers - a.answers
    )
    .slice(0, limit); // ✅ Top 5
}

class CitationExtractorNew {
  static extractChatGPT(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const { allUrls } = CitationExtractor.extractChatGPT(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
    return allUrls
      .map(url => ({ url, domain: normalizeDomain(url) }))
      .filter(item => item.url);
  }

  static extractGemini(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const { allCitations, allUrls } = CitationExtractor.extractGemini(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
    return allUrls
      .map((url, idx) => ({
        url,
        domain: allCitations[idx] || normalizeDomain(url)
      }))
      .filter(item => item.url);
  }

  static extractPerplexity(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const { allUrls } = CitationExtractor.extractPerplexity(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
    return allUrls
      .map(url => ({ url, domain: normalizeDomain(url) }))
      .filter(item => item.url);
  }

  static extractClaude(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const { allUrls } = CitationExtractor.extractClaude(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
    return allUrls
      .map(url => ({ url, domain: normalizeDomain(url) }))
      .filter(item => item.url);
  }

  static extractAIMode(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    const { allUrls } = CitationExtractor.extractAIMode(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
    return allUrls
      .map(url => ({ url, domain: normalizeDomain(url) }))
      .filter(item => item.url);
  }

  static extract(llmType, rawResults, targetDomain, brandName, fixedCompetitors) {
    switch (llmType) {
      case "llm_chatgpt":
        return this.extractChatGPT(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_gemini":
        return this.extractGemini(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_perplexity":
        return this.extractPerplexity(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_claude":
        return this.extractClaude(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      case "llm_aiMode":
        return this.extractAIMode(llmType, rawResults, targetDomain, brandName, fixedCompetitors);
      default:
        return [];
    }
  }
}

const getLLMPromptsWithUrls = async (req, res) => {
  try {
    const { filters, page = 1, limit = 10 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};

    const {
      projectId,
      platforms = [],
      domains = [],
      startDate,
      endDate,
      selectedDate,
      competitors = []
    } = parsedFilters;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    const project = await LLM.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    let fixedCompetitors = project.competitors;
    const taskQuery = { project_id: projectId };

    const ALL_LLM_TYPES = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude", "llm_aiMode"];
    let LLM_TYPES = ALL_LLM_TYPES;

    if (platforms && platforms.length > 0) {
      const platformMap = {
        chatgpt: "llm_chatgpt",
        gemini: "llm_gemini",
        perplexity: "llm_perplexity",
        claude: "llm_claude",
        ai_overview: "llm_aiMode"
      };
      LLM_TYPES = platforms.map(p => platformMap[p]).filter(Boolean);
    }

    taskQuery.task_type = { $in: LLM_TYPES };

    // ✅ Corrected date filter logic
    if (selectedDate) {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      taskQuery.created_at = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      taskQuery.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const tasks = await Task.find(taskQuery).lean();
    if (!tasks || tasks.length === 0) {
      return res.json({
        message: "No tasks found",
        data: {
          rows: [],
          pagination: { currentPage: +page, totalPages: 0, totalRows: 0, pageSize: +limit },
          availableFilters: { domains: [], competitors: [], platforms: [] }
        }
      });
    }

    // 🧠 Find the latest date among all tasks
    const latestDate = new Date(
      Math.max(...tasks.map(t => new Date(t.created_at).getTime()))
    );

    // Normalize (ignore time - only date part)
    const latestDateOnly = latestDate.toISOString().split("T")[0];

    // 🧠 If selectedDate provided, no need to find latest date
    const effectiveDate = selectedDate
      ? new Date(selectedDate).toISOString().split("T")[0]
      : new Date(
        Math.max(...tasks.map(t => new Date(t.created_at).getTime()))
      )
        .toISOString()
        .split("T")[0];

    const latestTasks = tasks.filter(task => {
      const taskDateOnly = new Date(task.created_at).toISOString().split("T")[0];
      return taskDateOnly === effectiveDate;
    });

    // 🔽 Process only latest date's tasks
    const allRows = [];
    const uniqueDomains = new Set();
    const uniqueCompetitors = new Set();

    for (const task of latestTasks) {
      const prompt = safeDecode(task.data?.user_prompt || "");
      const llmType = task.task_type;
      const platform = llmType.replace("llm_", "");
      const taskDate = new Date(task.created_at);

      const urlData = CitationExtractorNew.extract(
        llmType,
        task.results || [],
        project.target,          // targetDomain
        project.brand,
        fixedCompetitors
      );
      urlData.forEach(({ url, domain }) => {
        const normalizedUrls = normalizeUrl(url);

        if (!normalizedUrls) return;

        // const normalizedDomain = domain
        //   ? domain.replace(/^www\./, "").toLowerCase()
        //   : null;

        const normalizedDomain = normalizeDomain(normalizedUrls); // or reuse your normalizeDomain

        // console.log(normalizedDomain, "normalizedDomain---")

        uniqueDomains.add(normalizedDomain);
        const brand = extractBrandFromDomain(normalizedDomain);
        if (brand) uniqueCompetitors.add(brand);

        allRows.push({
          taskId: task._id,
          prompt,
          url: normalizedUrls,
          rawUrl: url,             // optional, if you still want original for display
          domain: normalizedDomain,
          platform,
          date: taskDate.toISOString()
        });
      });
    }

    // Apply filters
    let filteredRows = allRows;

    if (domains && domains.length > 0) {
      // console.log(domains, "domains")
      const normalizedDomains = domains.map(d => d.replace(/^www\./, "").toLowerCase());
      // console.log(normalizedDomains, "normalizedDomains----------------->")
      filteredRows = filteredRows.filter(row =>
        row.domain && normalizedDomains.includes(row.domain.toLowerCase())
      );
    }

    // console.log(filteredRows,"filteredRows")

    // if (competitors && competitors.length > 0) {
    //   // const normalizedCompetitors = competitors.map(d =>
    //   //   d.split(".")[0].replace(/^www\./, "").toLowerCase()
    //   // );

    //   const normalizedCompetitors = competitors.map(d => {
    //     return d
    //       .toLowerCase()
    //       .replace(/^https?:\/\//, "")
    //       .replace(/^www\./, "")
    //       .replace(/\/.*$/, ""); // remove path if any
    //   });

    //   // console.log(normalizedCompetitors, "normalizedCompetitors")
    //   filteredRows = filteredRows.filter(row => {
    //     if (!row.domain) return false;
    //     const brand = extractBrandFromDomain(row.domain);
    //     console.log(brand,"brand")
    //     return brand && normalizedCompetitors.includes(brand.toLowerCase());
    //   });
    // }

    if (competitors && competitors.length > 0) {
      const normalizedCompetitors = competitors.map(d =>
        d
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/.*$/, "")
      );

      filteredRows = filteredRows.filter(row => {
        if (!row.domain) return false;

        const rowDomain = row.domain
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/.*$/, "");

        return normalizedCompetitors.includes(rowDomain);
      });
    }



    // ✅ NOW DE-DUPE BY URL (already normalized earlier)
    // const uniqueUrlMap = new Map();
    // for (const row of filteredRows) {
    //   if (!row.url) continue;
    //   if (!uniqueUrlMap.has(row.url)) {
    //     uniqueUrlMap.set(row.url, row);   // keep first row for that URL
    //   }
    // }
    // filteredRows = Array.from(uniqueUrlMap.values());

    // Pagination
    const totalRows = filteredRows.length;
    const currentPage = +page;
    const pageSize = +limit;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedRows = filteredRows.slice(startIndex, endIndex);

    return res.json({
      message: "Prompts with URLs fetched successfully (latest date only)",
      data: {
        rows: paginatedRows,
        pagination: {
          currentPage,
          totalPages,
          totalRows,
          pageSize,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        },
        filters: {
          projectId,
          project,
          platforms,
          domains,
          competitors,
          fixedCompetitors,
          dateRange: { start: latestDateOnly, end: latestDateOnly }
        }
      }
    });

  } catch (err) {
    console.error("getLLMPromptsWithUrls error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};

const getLLMPromptsByBrand = async (req, res) => {
  try {
    const { filters, page = 1, limit = 10 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const {
      projectId,
      platforms = [],
      competitors,   // can now be string OR array
      myPage,
      startDate,
      endDate,
      selectedDate
    } = parsedFilters;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Fetch project
    const project = await LLM.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const mainProject = { brand: project.brand, domain: project.target };
    const projectCompetitors = project?.competitors || [];
    const allBrands = [mainProject, ...projectCompetitors];

    const fixedCompetitors = allBrands.reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain
      };
      return acc;
    }, {});

    const normalizeDomain = (d) => d?.replace(/^www\./, "").toLowerCase();

    // ------------------------------------------------
    // 🔹 Handle competitor filter (string OR array)
    // ------------------------------------------------
    let selectedCompetitorDomain = null;
    if (Array.isArray(competitors)) {
      if (competitors.length > 0) {
        selectedCompetitorDomain = normalizeDomain(competitors[0]);
      }
    } else if (typeof competitors === "string" && competitors.trim() !== "") {
      selectedCompetitorDomain = normalizeDomain(competitors);
    }

    // -------------------------------
    // 🟢 Determine active brand/domain
    // -------------------------------
    let targetDomain = myPage ? normalizeDomain(myPage) : null;
    let brandName = mainProject.brand;

    // If a competitor is selected, use that as the active target
    if (selectedCompetitorDomain) {
      targetDomain = selectedCompetitorDomain;

      const competitorBrand = allBrands.find(
        (b) => normalizeDomain(b.domain) === selectedCompetitorDomain
      );
      if (competitorBrand) {
        brandName = competitorBrand.brand;
      }
    }

    if (!targetDomain) {
      return res.status(400).json({ error: "Target domain/brand is required" });
    }

    const BRAND_NAME_MAP = allBrands.reduce((acc, item) => {
      acc[item.brand] = item.brand;
      return acc;
    }, {});

    const targetBrands = allBrands.map((item) => item.brand);

    // Task query
    const ALL_LLM_TYPES = [
      "llm_chatgpt",
      "llm_gemini",
      "llm_perplexity",
      "llm_claude",
      "llm_aiMode"
    ];

    const PLATFORM_MAP = {
      chatgpt: "llm_chatgpt",
      gemini: "llm_gemini",
      perplexity: "llm_perplexity",
      claude: "llm_claude",
      ai_overview: "llm_aiMode"
    };

    let LLM_TYPES =
      platforms.length > 0
        ? platforms.map((p) => PLATFORM_MAP[p]).filter(Boolean)
        : ALL_LLM_TYPES;

    const taskQuery = {
      project_id: projectId,
      task_type: { $in: LLM_TYPES }
    };

    // ✅ Date filter logic
    if (selectedDate) {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      taskQuery.created_at = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate || endDate) {
      taskQuery.created_at = {};
      if (startDate) taskQuery.created_at.$gte = new Date(startDate);
      if (endDate) taskQuery.created_at.$lte = new Date(endDate);
    }

    const tasks = await Task.find(taskQuery).lean();
    if (!tasks || tasks.length === 0) {
      return res.json({
        message: "No tasks found",
        data: {
          rows: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalRows: 0,
            pageSize: parseInt(limit)
          },
          availableFilters: { brands: [], platforms: [] }
        }
      });
    }

    // ✅ Use selectedDate if given; otherwise fallback to latest available date
    let effectiveDate;
    if (selectedDate) {
      effectiveDate = new Date(selectedDate).toISOString().split("T")[0];
    } else {
      const latestDate = new Date(
        Math.max(...tasks.map((t) => new Date(t.created_at)))
      );
      effectiveDate = latestDate.toISOString().split("T")[0];
    }

    // 🔹 Filter only tasks matching effectiveDate
    const filteredTasks = tasks.filter((task) => {
      const taskDateKey = new Date(task.created_at)
        .toISOString()
        .split("T")[0];
      return taskDateKey === effectiveDate;
    });

    const brandDetector = new BrandMentionDetector();
    const promptBrandMap = new Map();

    for (const task of filteredTasks) {
      const taskDate = new Date(task.created_at);
      const prompt = safeDecode(task.data?.user_prompt || "");
      const llmType = task.task_type;

      const extraction = CitationExtractor.extract(
        llmType,
        brandName, // main brand or competitor
        fixedCompetitors,
        task.results || [],
        targetDomain, // main domain or competitor domain
        taskDate
      );
      if (!extraction) continue;

      const { text, rank } = extraction;
      const targetBrandMentioned = brandDetector.isTargetBrandMentioned(
        text,
        targetDomain,
        brandName
      );
      if (!targetBrandMentioned) continue;

      const key = prompt;
      if (!promptBrandMap.has(key)) {
        promptBrandMap.set(key, {
          prompt,
          markdown: text || "",
          domain: targetDomain,
          brands: new Set(),
          platforms: new Set(),
          taskId: task._id,
          date: taskDate,
          rank
        });
      }

      const entry = promptBrandMap.get(key);
      entry.brands.add(brandName);
      entry.platforms.add(llmType.replace("llm_", ""));
    }

    // Convert Map to array
    let allRows = Array.from(promptBrandMap.values()).flatMap((entry) => {
      const prompt = entry.prompt;
      const brands = brandName; // active brand only (main or competitor)
      const markdown = entry.markdown;
      const date = entry.date.toISOString();
      const domain = entry.domain;
      const rank = entry.rank;

      return Array.from(entry.platforms).map((platform) => ({
        taskId: entry.taskId,
        prompt,
        brands,
        markdown,
        platform,
        date,
        domain,
        rank
      }));
    });

    // Pagination
    const totalRows = allRows.length;
    const currentPage = parseInt(page);
    const pageSize = parseInt(limit);
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedRows = allRows.slice(startIndex, endIndex);

    return res.json({
      message: "Prompts with target brand fetched successfully",
      data: {
        rows: paginatedRows,
        project,
        pagination: {
          currentPage,
          totalPages,
          totalRows,
          pageSize,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        },
        availableFilters: {
          brands: targetBrands.flat(),
          platforms: ALL_LLM_TYPES.map((t) => t.replace("llm_", ""))
        },
        filters: {
          projectId,
          targetBrand: brandName,
          // send back a single competitor value for the radio UI
          competitor: selectedCompetitorDomain || null
        },
        latestDate: effectiveDate
      }
    });
  } catch (err) {
    console.error("getLLMPromptsByBrand error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
};

const getMyPages = async (req, res) => {
  try {
    const { id } = req.params;

    let data = await UrlScan.find({ project_id: id })

    let totalCount = data.filter((item) => item.result === true).map((item) => item.result).length

    res.json({
      message: "data fetched successfully",
      totalCount,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: error?.message || "server error" });
  }
}

// simple brand detection in HTML
function detectBrandInHtml1(html, brandName, targetDomainRaw) {
  if (!html || !brandName) return false;

  const text = html.toLowerCase();
  const brand = brandName.toLowerCase();
  const targetDomain = normalizeDomain(targetDomainRaw || "");

  // Escape regex special chars in brand
  const escapeRegExp = (str) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // match brand as a word
  const brandRegex = new RegExp(`\\b${escapeRegExp(brand)}\\b`, "i");

  if (brandRegex.test(text)) return true;

  if (targetDomain && text.includes(targetDomain)) return true;

  return false;
}

const getMyPages1 = async (req, res) => {
  try {
    const { id } = req.params; // projectId
    const { startDate, endDate, selectedDate } = req.query; // query parameters

    // 1️⃣ Load project (brand + domain + competitors)
    const project = await LLM.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const mainProject = { brand: project.brand, domain: project.target };
    const projectCompetitors = project.competitors || [];
    const allBrands = [mainProject, ...projectCompetitors];

    const fixedCompetitors = allBrands.reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain,
      };
      return acc;
    }, {});

    const brandName = project.brand;
    const targetDomainRaw = project.target;
    const targetDomain = normalizeDomain(targetDomainRaw);

    const ALL_LLM_TYPES = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude", "llm_aiMode"];

    // 2️⃣ Find latest task date (fast)
    const latestTask = await Task.findOne({
      project_id: id,
      task_type: { $in: ALL_LLM_TYPES },
    })
      .sort({ created_at: -1 })
      .select("created_at")
      .lean();

    if (!latestTask) {
      return res.json({
        message: "No tasks found for this project",
        totalCount: 0,
        latestDate: null,
        fetch: { enqueued: 0, skipped: 0 },
      });
    }

    const latestDateKey = new Date(latestTask.created_at).toISOString().split("T")[0];

    // Use selectedDate if provided, otherwise use latestDate
    const dateToUse = selectedDate || latestDateKey;

    // Now apply date filter
    const taskQuery = { project_id: id, task_type: { $in: ALL_LLM_TYPES } };

    const date = new Date(dateToUse);
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end = new Date(date.setHours(23, 59, 59, 999));

    taskQuery.created_at = {
      $gte: start,
      $lte: end,
    };

    const tasks = await Task.find(taskQuery).lean();

    if (!tasks || tasks.length === 0) {
      return res.json({
        message: "No tasks found for this date",
        totalCount: 0,
        latestDate: latestDateKey,
      });
    }

    // 3️⃣ From all tasks → extract URLs via CitationExtractor (uniform logic)
    const urlSet = new Set();

    for (const task of tasks) {
      const llmType = task.task_type;
      const rawResults = task.results || [];

      const extracted = CitationExtractor.extract(
        llmType,
        brandName,
        fixedCompetitors,
        rawResults,
        targetDomainRaw
      );

      if (!extracted || !Array.isArray(extracted.allUrls)) continue;

      extracted.allUrls.forEach((u) => {
        const cu = cleanUrl(u);
        const nu = normalizeUrl(cu);
        if (nu) {
          urlSet.add(nu);
        }
      });
    }

    // Only third-party pages (exclude my domain)
    const projectUrls = Array.from(urlSet).filter((u) => normalizeDomain(u) !== targetDomain);

    if (projectUrls.length === 0) {
      return res.json({
        message: "No URLs found for this project",
        totalCount: 0,
        latestDate: latestDateKey,
        fetch: { enqueued: 0, skipped: 0 },
      });
    }

    // 4️⃣ Ensure URL fetch jobs exist (so count can populate over time)
    const fetchQueueResult = await enqueueUrlFetch(projectUrls);

    // 5️⃣ Look up those URLs in UrlFetch (only ones we have fetched HTML for)
    const fetchQuery = {
      url: { $in: projectUrls },
      status: "completed",
      fetch_status_code: 200,
      fetch_response_html: { $ne: null },
    };

    // Optional: date filter on fetch_date as well
    if (startDate || endDate) {
      fetchQuery.fetch_date = {};
      if (startDate) fetchQuery.fetch_date.$gte = new Date(startDate);
      if (endDate) fetchQuery.fetch_date.$lte = new Date(endDate);
    }

    const fetchedDocs = await UrlFetch.find(fetchQuery)
      .select("url fetch_response_html")
      .lean();

    if (!fetchedDocs || fetchedDocs.length === 0) {
      return res.json({
        message: "No fetched pages found for these URLs (fetch has been queued)",
        totalCount: 0,
        latestDate: latestDateKey,
        fetch: fetchQueueResult,
      });
    }

    // 5️⃣ Check which pages mention my brand / domain
    const pagesMentioningMe = new Set();

    for (const doc of fetchedDocs) {
      const html = doc.fetch_response_html || "";

      const hasBrand = detectBrandInHtml1(html, brandName, targetDomainRaw);

      if (hasBrand) {
        pagesMentioningMe.add(doc.url);
      }
    }

    const totalCount = pagesMentioningMe.size;

    return res.json({
      message: "data fetched successfully",
      totalCount,
      latestDate: latestDateKey,
      fetch: fetchQueueResult,
      // if you want to debug / inspect, you can also return URLs:
      // urls: Array.from(pagesMentioningMe),
    });
  } catch (error) {
    console.error("Error fetching my pages:", error);
    return res.status(500).json({
      message: error?.message || "server error",
    });
  }
};

const escapeRegex = (str) =>
  str ? str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";


const detectBrandInHtml = (html, brandName) => {
  if (!html || !brandName) return false;
  const pattern = new RegExp(`\\b${escapeRegex(brandName)}\\b`, "i");
  return pattern.test(html);
};

const stripHtmlToText = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
};

const detectBrandInHtmlLoose = (html, brandName) => {
  if (!html || !brandName) return false;
  const text = stripHtmlToText(html);
  if (!text) return false;
  const words = String(brandName).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const pattern =
    words.length === 1
      ? `\\b${escapeRegex(words[0])}\\b`
      : `\\b${words.map(escapeRegex).join("\\s+")}\\b`;
  return new RegExp(pattern, "i").test(text);
};

const getThirdPartyPages = async (req, res) => {
  try {
    const { filters, page = 1, limit = 10 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const {
      projectId,
      platforms = [],
      competitors,   // string OR array (domain) – used to switch brandName
      startDate,
      endDate,
      selectedDate
    } = parsedFilters;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    // ------------------------------------
    // 1️⃣ Fetch project (for brand + competitors)
    // ------------------------------------
    const project = await LLM.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const mainProject = { brand: project.brand, domain: project.target };
    const projectCompetitors = project?.competitors || [];
    const allBrands = [mainProject, ...projectCompetitors];

    const fixedCompetitors = allBrands.reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain
      };
      return acc;
    }, {});

    let projectDomainNormalized;

    if (competitors && competitors.length > 0) {
      projectDomainNormalized = normalizeDomain(competitors[0]);
    } else {
      projectDomainNormalized = normalizeDomain(project.target);
    }

    // ------------------------------------------------
    // 2️⃣ Handle competitor filter (string OR array)
    //     → decides *which brand* we search inside HTML
    // ------------------------------------------------
    let selectedCompetitorDomain = null;
    if (Array.isArray(competitors)) {
      if (competitors.length > 0) {
        selectedCompetitorDomain = normalizeDomain(competitors[0]);
      }
    } else if (typeof competitors === "string" && competitors.trim() !== "") {
      selectedCompetitorDomain = normalizeDomain(competitors);
    }

    let brandName = mainProject.brand; // default: our brand

    if (selectedCompetitorDomain) {
      const competitorBrand = allBrands.find(
        (b) => normalizeDomain(b.domain) === selectedCompetitorDomain
      );
      if (competitorBrand) {
        brandName = competitorBrand.brand;
      }
    }

    const targetBrands = allBrands.map((item) => item.brand);

    // ------------------------------------
    // 3️⃣ Build Task query (LLM tasks)
    // ------------------------------------
    const ALL_LLM_TYPES = [
      "llm_chatgpt",
      "llm_gemini",
      "llm_perplexity",
      "llm_claude",
      "llm_aiMode"
    ];

    const PLATFORM_MAP = {
      chatgpt: "llm_chatgpt",
      gemini: "llm_gemini",
      perplexity: "llm_perplexity",
      claude: "llm_claude",
      ai_overview: "llm_aiMode"
    };

    const LLM_TYPES =
      platforms.length > 0
        ? platforms.map((p) => PLATFORM_MAP[p]).filter(Boolean)
        : ALL_LLM_TYPES;

    const taskQuery = {
      project_id: projectId,
      task_type: { $in: LLM_TYPES }
    };

    // ✅ Date filter logic
    if (selectedDate) {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      taskQuery.created_at = { $gte: startOfDay, $lte: endOfDay };
    }

    const tasks = await Task.find(taskQuery).lean();

    if (!tasks || tasks.length === 0) {
      return res.json({
        message: "No tasks found",
        data: {
          rows: [],
          project,
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalRows: 0,
            pageSize: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          availableFilters: {
            brands: targetBrands,
            platforms: ALL_LLM_TYPES.map((t) => t.replace("llm_", ""))
          },
          filters: {
            projectId,
            targetBrand: brandName,
            competitor: selectedCompetitorDomain || null,
            selectedDate: selectedDate || null,
            startDate: startDate || null,
            endDate: endDate || null
          },
          latestDate: null
        }
      });
    }

    // ------------------------------------
    // 4️⃣ Determine effective date
    //    (selectedDate OR latest date from tasks)
    // ------------------------------------
    let effectiveDate;
    if (selectedDate) {
      effectiveDate = new Date(selectedDate).toISOString().split("T")[0];
    } else {
      const latestDate = new Date(
        Math.max(...tasks.map((t) => new Date(t.created_at)))
      );
      effectiveDate = latestDate.toISOString().split("T")[0];
    }

    // 🔹 Filter only tasks matching effectiveDate
    const filteredTasks = tasks.filter((task) => {
      const taskDateKey = new Date(task.created_at)
        .toISOString()
        .split("T")[0];
      return taskDateKey === effectiveDate;
    });

    if (!filteredTasks.length) {
      return res.json({
        message: "No tasks found for effective date",
        data: {
          rows: [],
          project,
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalRows: 0,
            pageSize: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          availableFilters: {
            brands: targetBrands,
            platforms: ALL_LLM_TYPES.map((t) => t.replace("llm_", ""))
          },
          filters: {
            projectId,
            targetBrand: brandName,
            competitor: selectedCompetitorDomain || null,
            selectedDate: selectedDate || null,
            startDate: startDate || null,
            endDate: endDate || null
          },
          latestDate: effectiveDate
        }
      });
    }

    const projectTargetRaw = project.target || null;

    const intermediateRows = [];
    const allUrlsSet = new Set();

    for (const task of filteredTasks) {
      const llmType = task.task_type;
      if (!LLM_TYPES.includes(llmType)) continue;

      const llmName = llmType.replace("llm_", ""); // platform value for UI
      const rawResults = task.results || [];

      const extracted = CitationExtractor.extract(
        llmType,
        brandName,
        fixedCompetitors,
        rawResults,
        projectTargetRaw
      );

      if (!extracted || !Array.isArray(extracted.allUrls)) continue;

      const cleanedUrls = extracted.allUrls
        .map(cleanUrl)
        .filter(Boolean);

      // unique URLs per task for this llm
      const uniqueUrls = [...new Set(cleanedUrls)];

      const prompt = safeDecode(task.data?.user_prompt || "");

      for (const url of uniqueUrls) {
        allUrlsSet.add(url);

        const urlDomain = normalizeDomain(url);
        const source_type =
          urlDomain && projectDomainNormalized && urlDomain === projectDomainNormalized
            ? "Me"
            : "Third Party";

        intermediateRows.push({
          taskId: task._id,
          url,
          prompt,
          platform: llmName,
          source_type,
          createdAt: task.created_at
        });
      }
    }

    if (intermediateRows.length === 0) {
      return res.json({
        message: "No URLs found in tasks",
        data: {
          rows: [],
          project,
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalRows: 0,
            pageSize: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          availableFilters: {
            brands: targetBrands,
            platforms: ALL_LLM_TYPES.map((t) => t.replace("llm_", ""))
          },
          filters: {
            projectId,
            targetBrand: brandName,
            competitor: selectedCompetitorDomain || null,
            selectedDate: selectedDate || null,
            startDate: startDate || null,
            endDate: endDate || null
          },
          latestDate: effectiveDate
        }
      });
    }

    // ------------------------------------
    // 6️⃣ Compare with UrlFetch (HTML) and keep only URLs
    //    where html contains the chosen brandName
    // ------------------------------------
    const allUrls = [...allUrlsSet];

    const urlFetchDocs = await UrlFetch.find(
      { url: { $in: allUrls } },
      { url: 1, fetch_response_html: 1 }
    ).lean();

    const urlFetchMap = new Map();
    urlFetchDocs.forEach((doc) => {
      urlFetchMap.set(doc.url, doc);
    });

    const allRows = intermediateRows.filter((row) => {
      const doc = urlFetchMap.get(row.url);
      if (!doc) return false;
      return detectBrandInHtml(doc.fetch_response_html, brandName);
    });

    // ------------------------------------
    // 7️⃣ Pagination (rows are already URL×prompt×platform)
    // ------------------------------------
    const totalRows = allRows.length;
    const currentPage = parseInt(page);
    const pageSize = parseInt(limit);
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedRows = allRows.slice(startIndex, endIndex);

    // ------------------------------------
    // 8️⃣ Response (structure similar to original)
    // ------------------------------------
    return res.json({
      message: "Third-party URL prompt matrix fetched successfully",
      data: {
        // Each row: url, prompt, source_type, platform
        rows: paginatedRows,
        project,
        pagination: {
          currentPage,
          totalPages,
          totalRows,
          pageSize,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        },
        availableFilters: {
          brands: targetBrands,
          platforms: ALL_LLM_TYPES.map((t) => t.replace("llm_", ""))
        },
        filters: {
          projectId,
          targetBrand: brandName,
          competitor: selectedCompetitorDomain || null,
          selectedDate: selectedDate || null,
          startDate: startDate || null,
          endDate: endDate || null
        },
        latestDate: effectiveDate
      }
    });
  } catch (err) {
    console.error("getThirdPartyPages error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
}

const getLLMPrompts = async (req, res) => {
  try {
    const { filters, page = 1, limit = 10 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const { projectId, selectedDate } = parsedFilters;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    const project = await LLM.findById(projectId).lean();

    if (!project) return res.status(404).json({ error: "Project not found" });

    if (!project.file_url) return res.status(400).json({ error: "Project has no file_url" });

    const UPLOAD_DIR = path.resolve(process.cwd(), "llm_uploads");
    const filename = path.basename(project.file_url);
    const candidateFromUploads = path.join(UPLOAD_DIR, filename);
    const candidateAbsolute = path.isAbsolute(project.file_url) ? project.file_url : null;

    let filePath = null;
    if (fs.existsSync(candidateFromUploads)) {
      filePath = candidateFromUploads;
    } else if (candidateAbsolute && fs.existsSync(candidateAbsolute)) {
      filePath = candidateAbsolute;
    } else {
      // neither exists — include both candidates in the error to debug quickly
      return res.status(404).json({
        error: "Uploaded file not found on server",
        tried: {
          candidateFromUploads,
          candidateAbsolute,
          originalFileUrl: project.file_url,
          uploadDir: UPLOAD_DIR,
        },
      });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "Uploaded file not found on server",
        computedPath: filePath,
        uploadDir: UPLOAD_DIR,
        file_url: project.file_url,
      });
    }

    // Read workbook and first sheet
    const workbook = xlsx.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: "Excel workbook has no sheets" });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({ message: "No rows in Excel sheet", data: { rows: [], pagination: {} } });
    }

    // Find a header that means 'keyword' (case-insensitive)
    const headers = Object.keys(rows[0]);
    const keywordHeader = headers.find(h => /keyword/i.test(h));

    if (!keywordHeader) {
      return res.status(400).json({
        error: "Excel must contain a 'Keyword' column (case-insensitive). Found headers: " + JSON.stringify(headers)
      });
    }

    // Build frequency map from Excel column (no normalization as you requested)
    const freq = new Map();
    for (const r of rows) {
      const raw = r[keywordHeader];
      const normalized = raw;
      if (!normalized) continue;
      const prev = freq.get(normalized) || 0;
      freq.set(normalized, prev + 1);
    }

    // Convert to array and sort (by count desc, then by prompt)
    const all = Array.from(freq.entries()).map(([prompt, count]) => ({ prompt, count }));
    all.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.prompt.localeCompare(b.prompt);
    });

    // Pagination
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
    const totalRows = all.length;
    const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 0;
    const normalizedPage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
    const start = (normalizedPage - 1) * pageSize;
    const paged = all.slice(start, start + pageSize);

    return res.json({
      message: "Unique prompts from uploaded Excel",
      data: {
        rows: paged, // { prompt, count }
        pagination: {
          currentPage: normalizedPage,
          totalPages,
          totalRows,
          pageSize,
          hasNextPage: normalizedPage < totalPages,
          hasPrevPage: normalizedPage > 1,
        },
        project: {
          _id: project._id,
          name: project.name,
          file_url: project.file_url,
          computedPath: filePath,
        },
      },
    });
  } catch (err) {
    console.error("getPromptsFromFile error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};

const compareLLMBrandMentionsByDates = async (req, res) => {
  try {
    const { filters, page = 1, limit = 50 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const {
      projectId,
      platforms = [],
      competitors, // string or array
      myPage,
      d1,
      d2,
    } = parsedFilters;

    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const project = await LLM.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.file_url) return res.status(400).json({ error: "Project has no file_url" });

    // -------------------------------
    // Baseline: ALL prompts from uploaded Excel (unique)
    // -------------------------------
    const UPLOAD_DIR = path.resolve(process.cwd(), "llm_uploads");
    const filename = path.basename(project.file_url);
    const candidateFromUploads = path.join(UPLOAD_DIR, filename);
    const candidateAbsolute = path.isAbsolute(project.file_url) ? project.file_url : null;

    let filePath = null;
    if (fs.existsSync(candidateFromUploads)) {
      filePath = candidateFromUploads;
    } else if (candidateAbsolute && fs.existsSync(candidateAbsolute)) {
      filePath = candidateAbsolute;
    } else {
      return res.status(404).json({
        error: "Uploaded file not found on server",
        tried: {
          candidateFromUploads,
          candidateAbsolute,
          originalFileUrl: project.file_url,
          uploadDir: UPLOAD_DIR,
        },
      });
    }

    let baselinePrompts = null;
    const promptCacheKey = `llmAdvanceFilterPrompts:${projectId}:${filename}`;
    const fileStat = fs.statSync(filePath);
    const cached = llmAdvanceFilterPromptCache.get(promptCacheKey);

    if (cached && cached.mtimeMs === fileStat.mtimeMs && Array.isArray(cached.prompts)) {
      baselinePrompts = cached.prompts;
    } else {
      const workbook = xlsx.readFile(filePath);
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ error: "Excel workbook has no sheets" });
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      if (!Array.isArray(excelRows) || excelRows.length === 0) {
        return res.json({
          message: "No rows in Excel sheet",
          data: {
            rows: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalRows: 0,
              pageSize: parseInt(limit, 10) || 50,
              hasNextPage: false,
              hasPrevPage: false,
            },
            meta: {
              hasTasksD1: false,
              hasTasksD2: false,
              baselinePrompts: 0,
            },
          },
        });
      }

      const headers = Object.keys(excelRows[0]);
      const keywordHeader = headers.find((h) => /keyword/i.test(h));
      if (!keywordHeader) {
        return res.status(400).json({
          error:
            "Excel must contain a 'Keyword' column (case-insensitive). Found headers: " +
            JSON.stringify(headers),
        });
      }

      const promptSet = new Set();
      for (const r of excelRows) {
        const raw = r[keywordHeader];
        const prompt = safeDecode(raw);
        if (!prompt) continue;
        promptSet.add(prompt);
      }

      baselinePrompts = Array.from(promptSet).sort((a, b) =>
        String(a).localeCompare(String(b))
      );

      llmAdvanceFilterPromptCache.set(promptCacheKey, {
        mtimeMs: fileStat.mtimeMs,
        prompts: baselinePrompts,
      });
    }

    const mainProject = { brand: project.brand, domain: project.target };
    const projectCompetitors = project?.competitors || [];
    const allBrands = [mainProject, ...projectCompetitors];

    const fixedCompetitors = allBrands.reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain,
      };
      return acc;
    }, {});

    const normalizeDomain = (value) => value?.replace(/^www\./, "").toLowerCase();

    let selectedCompetitorDomain = null;
    if (Array.isArray(competitors)) {
      if (competitors.length > 0) selectedCompetitorDomain = normalizeDomain(competitors[0]);
    } else if (typeof competitors === "string" && competitors.trim() !== "") {
      selectedCompetitorDomain = normalizeDomain(competitors);
    }

    let targetDomain = myPage ? normalizeDomain(myPage) : null;
    let brandName = mainProject.brand;

    if (selectedCompetitorDomain) {
      targetDomain = selectedCompetitorDomain;
      const competitorBrand = allBrands.find(
        (b) => normalizeDomain(b.domain) === selectedCompetitorDomain
      );
      if (competitorBrand) brandName = competitorBrand.brand;
    } else if (!targetDomain) {
      targetDomain = normalizeDomain(mainProject.domain);
    }

    if (!targetDomain) return res.status(400).json({ error: "Target domain/brand is required" });

    const ALL_LLM_TYPES = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude", "llm_aiMode"];
    const PLATFORM_MAP = {
      chatgpt: "llm_chatgpt",
      gemini: "llm_gemini",
      perplexity: "llm_perplexity",
      claude: "llm_claude",
      ai_overview: "llm_aiMode",
    };

    const LLM_TYPES =
      platforms.length > 0
        ? platforms.map((p) => PLATFORM_MAP[p]).filter(Boolean)
        : ALL_LLM_TYPES;

    const startOfDay = (dateStr) => {
      const dt = new Date(dateStr);
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const endOfDay = (dateStr) => {
      const dt = new Date(dateStr);
      dt.setHours(23, 59, 59, 999);
      return dt;
    };

    // -------------------------------
    // Resolve date range:
    // - If d1/d2 provided: use them
    // - Else: default to first task date (D1) and latest task date (D2)
    // -------------------------------
    let d1Key = d1 ? new Date(d1).toISOString().split("T")[0] : null;
    let d2Key = d2 ? new Date(d2).toISOString().split("T")[0] : null;

    if (!d1Key || !d2Key) {
      const oldestTask = await Task.findOne({
        project_id: projectId,
        task_type: { $in: LLM_TYPES },
      })
        .sort({ created_at: 1 })
        .select("created_at")
        .lean();

      const latestTask = await Task.findOne({
        project_id: projectId,
        task_type: { $in: LLM_TYPES },
      })
        .sort({ created_at: -1 })
        .select("created_at")
        .lean();

      if (!oldestTask || !latestTask) {
        return res.json({
          message: "No tasks found for this project",
          data: {
            rows: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalRows: 0,
              pageSize: parseInt(limit, 10) || 50,
              hasNextPage: false,
              hasPrevPage: false,
            },
            filters: {
              projectId,
              myPage: myPage || null,
              competitor: null,
              d1: null,
              d2: null,
            },
            meta: {
              baselinePrompts: baselinePrompts.length,
              hasTasksD1: false,
              hasTasksD2: false,
            },
          },
        });
      }

      const oldestKey = new Date(oldestTask.created_at).toISOString().split("T")[0];
      const latestKey = new Date(latestTask.created_at).toISOString().split("T")[0];

      if (!d1Key) d1Key = oldestKey;
      if (!d2Key) d2Key = latestKey;
    }

    const d1Start = startOfDay(d1Key);
    const d1End = endOfDay(d1Key);
    const d2Start = startOfDay(d2Key);
    const d2End = endOfDay(d2Key);

    const taskQuery = {
      project_id: projectId,
      task_type: { $in: LLM_TYPES },
    };

    if (d1Key === d2Key) {
      taskQuery.created_at = { $gte: d1Start, $lte: d1End };
    } else {
      taskQuery.$or = [
        { created_at: { $gte: d1Start, $lte: d1End } },
        { created_at: { $gte: d2Start, $lte: d2End } },
      ];
    }

    const tasks = await Task.find(taskQuery).lean();

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 50, 1);
    const totalRows = baselinePrompts.length;
    const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 0;
    const normalizedPage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
    const start = (normalizedPage - 1) * pageSize;
    const pagedPrompts = baselinePrompts.slice(start, start + pageSize);
    const pagedPromptLookup = new Set(pagedPrompts);
    const baselinePromptLookup = new Set(baselinePrompts);

    const brandDetector = new BrandMentionDetector();
    const promptsD1 = new Set();
    const promptsD2 = new Set();
    const promptToPlatforms = new Map();
    const TYPE_TO_PLATFORM = {
      llm_chatgpt: "chatgpt",
      llm_gemini: "gemini",
      llm_perplexity: "perplexity",
      llm_claude: "claude",
      llm_aiMode: "ai_overview",
    };

    const allowedPlatforms = new Set(Object.values(TYPE_TO_PLATFORM));
    const selectedPlatforms =
      Array.isArray(platforms) && platforms.length > 0
        ? platforms.map((p) => String(p).toLowerCase()).filter((p) => allowedPlatforms.has(p))
        : Array.from(allowedPlatforms);
    let hasTasksD1 = false;
    let hasTasksD2 = false;

    for (const task of tasks) {
      const taskDate = new Date(task.created_at);
      const taskDateKey = taskDate.toISOString().split("T")[0];
      if (taskDateKey !== d1Key && taskDateKey !== d2Key) continue;

      if (taskDateKey === d1Key) hasTasksD1 = true;
      if (taskDateKey === d2Key) hasTasksD2 = true;

      const prompt = safeDecode(task.data?.user_prompt || "");
      if (!prompt) continue;
      if (!pagedPromptLookup.has(prompt)) continue;

      const extracted = CitationExtractor.extract(
        task.task_type,
        brandName,
        fixedCompetitors,
        task.results || [],
        targetDomain,
        taskDate
      );
      if (!extracted) continue;

      const mentioned = brandDetector.isTargetBrandMentioned(
        extracted.text || "",
        targetDomain,
        brandName
      );
      if (!mentioned) continue;

      const platformKey = TYPE_TO_PLATFORM[task.task_type] || null;
      if (platformKey) {
        if (!promptToPlatforms.has(prompt)) promptToPlatforms.set(prompt, new Set());
        promptToPlatforms.get(prompt).add(platformKey);
      }

      if (taskDateKey === d1Key) promptsD1.add(prompt);
      if (taskDateKey === d2Key) promptsD2.add(prompt);
    }

    const rows = pagedPrompts.map((prompt) => {
      const mentionD1 = promptsD1.has(prompt);
      const mentionD2 = promptsD2.has(prompt);
      const platformSet = promptToPlatforms.get(prompt) || new Set();
      const platformsForPrompt = platformSet.size > 0 ? Array.from(platformSet) : selectedPlatforms;

      let status = "unchanged";
      if (mentionD1 && !mentionD2) status = "lost";
      else if (!mentionD1 && mentionD2) status = "gained";
      else if (mentionD1 && mentionD2) status = "retained";

      return {
        prompt,
        platforms: platformsForPrompt,
        d1: mentionD1 ? "yes" : "no",
        d2: mentionD2 ? "yes" : "no",
        status,
      };
    });

    const normalizedStatusFilter = String(parsedFilters.statusFilter || "").toLowerCase();
    const filteredRows =
      normalizedStatusFilter && normalizedStatusFilter !== "all"
        ? rows.filter((r) => String(r.status || "").toLowerCase() === normalizedStatusFilter)
        : rows;

    const effectiveTotalRows =
      normalizedStatusFilter && normalizedStatusFilter !== "all" ? filteredRows.length : totalRows;
    const effectiveTotalPages =
      normalizedStatusFilter && normalizedStatusFilter !== "all"
        ? effectiveTotalRows > 0
          ? 1
          : 0
        : totalPages;
    const effectiveCurrentPage =
      normalizedStatusFilter && normalizedStatusFilter !== "all" ? 1 : normalizedPage;

    return res.json({
      message: "LLM brand mention comparison fetched successfully",
      data: {
        rows: filteredRows,
        pagination: {
          currentPage: effectiveCurrentPage,
          totalPages: effectiveTotalPages,
          totalRows: effectiveTotalRows,
          pageSize,
          hasNextPage: effectiveCurrentPage < effectiveTotalPages,
          hasPrevPage: effectiveCurrentPage > 1,
        },
        filters: {
          projectId,
          myPage: myPage || null,
          competitor: selectedCompetitorDomain || null,
          d1: d1Key,
          d2: d2Key,
        },
        meta: {
          hasTasksD1,
          hasTasksD2,
          baselinePrompts: baselinePrompts.length,
        },
      },
    });
  } catch (err) {
    console.error("compareLLMBrandMentionsByDates error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};

const compareLLMMyPagesCitedByDates = async (req, res) => {
  try {
    const { filters, page = 1, limit = 50 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const {
      projectId,
      platforms = [],
      myPage,
      d1,
      d2,
      statusFilter,
      sortKey,
      sortDir,
    } = parsedFilters;

    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const project = await LLM.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.file_url) return res.status(400).json({ error: "Project has no file_url" });

    // -------------------------------
    // Baseline: ALL prompts from uploaded Excel (unique) - cached
    // -------------------------------
    const UPLOAD_DIR = path.resolve(process.cwd(), "llm_uploads");
    const filename = path.basename(project.file_url);
    const candidateFromUploads = path.join(UPLOAD_DIR, filename);
    const candidateAbsolute = path.isAbsolute(project.file_url) ? project.file_url : null;

    let filePath = null;
    if (fs.existsSync(candidateFromUploads)) {
      filePath = candidateFromUploads;
    } else if (candidateAbsolute && fs.existsSync(candidateAbsolute)) {
      filePath = candidateAbsolute;
    } else {
      return res.status(404).json({
        error: "Uploaded file not found on server",
        tried: {
          candidateFromUploads,
          candidateAbsolute,
          originalFileUrl: project.file_url,
          uploadDir: UPLOAD_DIR,
        },
      });
    }

    let baselinePrompts = null;
    const promptCacheKey = `llmAdvanceFilterPrompts:${projectId}:${filename}`;
    const fileStat = fs.statSync(filePath);
    const cached = llmAdvanceFilterPromptCache.get(promptCacheKey);

    if (cached && cached.mtimeMs === fileStat.mtimeMs && Array.isArray(cached.prompts)) {
      baselinePrompts = cached.prompts;
    } else {
      const workbook = xlsx.readFile(filePath);
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ error: "Excel workbook has no sheets" });
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      if (!Array.isArray(excelRows) || excelRows.length === 0) {
        return res.json({
          message: "No rows in Excel sheet",
          data: {
            rows: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalRows: 0,
              pageSize: parseInt(limit, 10) || 50,
              hasNextPage: false,
              hasPrevPage: false,
            },
            meta: { baselinePrompts: 0 },
          },
        });
      }

      const headers = Object.keys(excelRows[0]);
      const keywordHeader = headers.find((h) => /keyword/i.test(h));
      if (!keywordHeader) {
        return res.status(400).json({
          error:
            "Excel must contain a 'Keyword' column (case-insensitive). Found headers: " +
            JSON.stringify(headers),
        });
      }

      const promptSet = new Set();
      for (const r of excelRows) {
        const raw = r[keywordHeader];
        const prompt = safeDecode(raw);
        if (!prompt) continue;
        promptSet.add(prompt);
      }

      baselinePrompts = Array.from(promptSet).sort((a, b) =>
        String(a).localeCompare(String(b))
      );

      llmAdvanceFilterPromptCache.set(promptCacheKey, {
        mtimeMs: fileStat.mtimeMs,
        prompts: baselinePrompts,
      });
    }

    const mainProject = { brand: project.brand, domain: project.target };
    const projectCompetitors = project?.competitors || [];
    const allBrands = [mainProject, ...projectCompetitors];

    const fixedCompetitors = allBrands.reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain,
      };
      return acc;
    }, {});

    const brandName = project.brand;
    const targetDomainRaw = myPage || project.target;

    const ALL_LLM_TYPES = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude", "llm_aiMode"];
    const PLATFORM_MAP = {
      chatgpt: "llm_chatgpt",
      gemini: "llm_gemini",
      perplexity: "llm_perplexity",
      claude: "llm_claude",
      ai_overview: "llm_aiMode",
    };

    const selectedPlatformKeysRaw =
      Array.isArray(platforms) && platforms.length > 0 ? platforms : Object.keys(PLATFORM_MAP);
    const selectedPlatformKeys = selectedPlatformKeysRaw
      .map((p) => String(p).toLowerCase())
      .filter((p) => PLATFORM_MAP[p]);

    const LLM_TYPES =
      selectedPlatformKeys.length > 0
        ? selectedPlatformKeys.map((p) => PLATFORM_MAP[p]).filter(Boolean)
        : ALL_LLM_TYPES;

    const TASKTYPE_TO_PLATFORMKEY = Object.entries(PLATFORM_MAP).reduce((acc, [k, v]) => {
      acc[v] = k;
      return acc;
    }, {});

    const startOfDay = (dateStr) => {
      const dt = new Date(dateStr);
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const endOfDay = (dateStr) => {
      const dt = new Date(dateStr);
      dt.setHours(23, 59, 59, 999);
      return dt;
    };

    // Resolve default D1/D2 if not provided (oldest + latest task dates)
    let d1Key = d1 ? new Date(d1).toISOString().split("T")[0] : null;
    let d2Key = d2 ? new Date(d2).toISOString().split("T")[0] : null;

    if (!d1Key || !d2Key) {
      const oldestTask = await Task.findOne({
        project_id: projectId,
        task_type: { $in: LLM_TYPES },
      })
        .sort({ created_at: 1 })
        .select("created_at")
        .lean();

      const latestTask = await Task.findOne({
        project_id: projectId,
        task_type: { $in: LLM_TYPES },
      })
        .sort({ created_at: -1 })
        .select("created_at")
        .lean();

      if (!oldestTask || !latestTask) {
        return res.json({
          message: "No tasks found for this project",
          data: {
            rows: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalRows: 0,
              pageSize: parseInt(limit, 10) || 50,
              hasNextPage: false,
              hasPrevPage: false,
            },
            filters: {
              projectId,
              myPage: targetDomainRaw || null,
              d1: null,
              d2: null,
            },
            meta: {
              baselinePrompts: baselinePrompts.length,
            },
          },
        });
      }

      const oldestKey = new Date(oldestTask.created_at).toISOString().split("T")[0];
      const latestKey = new Date(latestTask.created_at).toISOString().split("T")[0];
      if (!d1Key) d1Key = oldestKey;
      if (!d2Key) d2Key = latestKey;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 50, 1);
    const baselinePromptLookup = new Set(baselinePrompts);

    const d1Start = startOfDay(d1Key);
    const d1End = endOfDay(d1Key);
    const d2Start = startOfDay(d2Key);
    const d2End = endOfDay(d2Key);

    const taskQuery = {
      project_id: projectId,
      task_type: { $in: LLM_TYPES },
    };

    if (d1Key === d2Key) {
      taskQuery.created_at = { $gte: d1Start, $lte: d1End };
    } else {
      taskQuery.$or = [
        { created_at: { $gte: d1Start, $lte: d1End } },
        { created_at: { $gte: d2Start, $lte: d2End } },
      ];
    }

    const tasks = await Task.find(taskQuery).lean();

    const promptPlatformToUrls = new Map(); // key(prompt|||platform) -> { d1:Set, d2:Set }

    for (const task of tasks) {
      const taskDate = new Date(task.created_at);
      const taskDateKey = taskDate.toISOString().split("T")[0];
      if (taskDateKey !== d1Key && taskDateKey !== d2Key) continue;

      const prompt = safeDecode(task.data?.user_prompt || "");
      if (!prompt) continue;
      if (!baselinePromptLookup.has(prompt)) continue;

      const platformKey = TASKTYPE_TO_PLATFORMKEY[task.task_type] || null;
      if (!platformKey) continue;

      const extracted = CitationExtractor.extract(
        task.task_type,
        brandName,
        fixedCompetitors,
        task.results || [],
        targetDomainRaw || null,
        taskDate
      );

      if (!extracted || !Array.isArray(extracted.matchedUrls)) continue;

      const mapKey = `${prompt}|||${platformKey}`;
      if (!promptPlatformToUrls.has(mapKey)) {
        promptPlatformToUrls.set(mapKey, { d1: new Set(), d2: new Set() });
      }

      const entry = promptPlatformToUrls.get(mapKey);
      for (const u of extracted.matchedUrls) {
        const nu = normalizeUrl(u);
        if (!nu) continue;
        if (taskDateKey === d1Key) entry.d1.add(nu);
        if (taskDateKey === d2Key) entry.d2.add(nu);
      }
    }

    const statusCountsAll = { gained: 0, lost: 0, retained: 0, unchanged: 0 };
    let urlChangedRows = 0;
    let totalD1Urls = 0;
    let totalD2Urls = 0;

    const setsDiffer = (a, b) => {
      if (a.size !== b.size) return true;
      for (const v of a) {
        if (!b.has(v)) return true;
      }
      return false;
    };

    const statusRank = (status) => {
      const s = String(status || "").toLowerCase();
      // For status sorting: prioritize LOST first (desc)
      if (s === "lost") return 4;
      if (s === "gained") return 3;
      if (s === "retained") return 2;
      if (s === "unchanged") return 1;
      return 0;
    };

    // Build all rows as (prompt, platform) pairs, compute meta for sorting/pagination
    const allRowMeta = [];
    for (const prompt of baselinePrompts) {
      for (const platformKey of selectedPlatformKeys) {
        const mapKey = `${prompt}|||${platformKey}`;
        const entry = promptPlatformToUrls.get(mapKey) || { d1: new Set(), d2: new Set() };
        const d1Count = entry.d1.size || 0;
        const d2Count = entry.d2.size || 0;
        totalD1Urls += d1Count;
        totalD2Urls += d2Count;

        const inD1 = d1Count > 0;
        const inD2 = d2Count > 0;
        let status = "unchanged";
        if (inD1 && !inD2) status = "lost";
        else if (!inD1 && inD2) status = "gained";
        else if (inD1 && inD2) status = "retained";

        statusCountsAll[status] = (statusCountsAll[status] || 0) + 1;
        if (setsDiffer(entry.d1, entry.d2)) urlChangedRows += 1;

        allRowMeta.push({
          prompt,
          platform: platformKey,
          status,
          statusSort: statusRank(status),
        });
      }
    }

    const normalizedStatusFilter = String(statusFilter || "all").toLowerCase();
    const allowedStatusFilters = new Set(["all", "gained", "lost", "unchanged", "retained"]);
    const effectiveStatusFilter = allowedStatusFilters.has(normalizedStatusFilter)
      ? normalizedStatusFilter
      : "all";

    const filteredRowMeta =
      effectiveStatusFilter === "all"
        ? allRowMeta
        : allRowMeta.filter((r) => String(r.status || "").toLowerCase() === effectiveStatusFilter);

    const statusCountsFiltered = { gained: 0, lost: 0, retained: 0, unchanged: 0 };
    for (const r of filteredRowMeta) {
      const s = String(r.status || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(statusCountsFiltered, s)) statusCountsFiltered[s] += 1;
    }

    const statusCountsForSummary =
      effectiveStatusFilter === "all" ? statusCountsAll : statusCountsFiltered;

    // If status filter is applied, recompute URL totals and URL-changed counts for filtered rows
    let totalD1UrlsFiltered = 0;
    let totalD2UrlsFiltered = 0;
    let urlChangedRowsFiltered = 0;
    if (effectiveStatusFilter !== "all") {
      for (const rm of filteredRowMeta) {
        const mapKey = `${rm.prompt}|||${rm.platform}`;
        const entry = promptPlatformToUrls.get(mapKey) || { d1: new Set(), d2: new Set() };
        totalD1UrlsFiltered += entry.d1.size || 0;
        totalD2UrlsFiltered += entry.d2.size || 0;
        if (setsDiffer(entry.d1, entry.d2)) urlChangedRowsFiltered += 1;
      }
    }

    const totalRowsAll = allRowMeta.length;
    const totalRows = filteredRowMeta.length;
    const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 0;
    const normalizedPage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
    const start = (normalizedPage - 1) * pageSize;

    // Server-side sorting across the entire project (all prompt+platform rows), then paginate
    const allowedSortKeys = new Set([
      "prompt",
      "status",
      "change",
      "d1",
      "d2",
      "d1UrlCount",
      "d2UrlCount",
    ]);

    const effectiveSortKey = allowedSortKeys.has(String(sortKey || "")) ? String(sortKey) : "prompt";
    const effectiveSortDir = String(sortDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
    const dirMult = effectiveSortDir === "desc" ? -1 : 1;

    const yesNoRank = (v) => (String(v || "").toLowerCase() === "yes" ? 1 : 0);

    const getEntryCounts = (prompt, platformKey) => {
      const mapKey = `${prompt}|||${platformKey}`;
      const entry = promptPlatformToUrls.get(mapKey) || { d1: new Set(), d2: new Set() };
      return { d1Count: entry.d1.size || 0, d2Count: entry.d2.size || 0 };
    };

    const getSortValue = (rowMeta) => {
      const meta = rowMeta || { prompt: "", platform: "", status: "unchanged", statusSort: 0 };
      const { d1Count, d2Count } = getEntryCounts(meta.prompt, meta.platform);
      switch (effectiveSortKey) {
        case "prompt":
          return String(meta.prompt || "");
        case "status":
          return meta.statusSort || 0;
        case "d1UrlCount":
          return d1Count || 0;
        case "d2UrlCount":
          return d2Count || 0;
        case "change":
          // net change = |d2| - |d1| (since sets)
          return (d2Count || 0) - (d1Count || 0);
        case "d1":
          return yesNoRank(d1Count > 0 ? "yes" : "no");
        case "d2":
          return yesNoRank(d2Count > 0 ? "yes" : "no");
        default:
          return String(meta.prompt || "");
      }
    };

    const sortedRowMeta = [...filteredRowMeta].sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (typeof av === "number" && typeof bv === "number") {
        if (av < bv) return -1 * dirMult;
        if (av > bv) return 1 * dirMult;
        const t1 = String(a.prompt).localeCompare(String(b.prompt));
        if (t1 !== 0) return t1 * dirMult;
        return String(a.platform).localeCompare(String(b.platform)) * dirMult;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      const cmp = as.localeCompare(bs);
      if (cmp !== 0) return cmp * dirMult;
      const t1 = String(a.prompt).localeCompare(String(b.prompt));
      if (t1 !== 0) return t1 * dirMult;
      return String(a.platform).localeCompare(String(b.platform)) * dirMult;
    });

    const pagedRowMeta = sortedRowMeta.slice(start, start + pageSize);

    const rows = pagedRowMeta.map((rm) => {
      const mapKey = `${rm.prompt}|||${rm.platform}`;
      const entry = promptPlatformToUrls.get(mapKey) || { d1: new Set(), d2: new Set() };
      const d1Urls = Array.from(entry.d1).sort((a, b) => String(a).localeCompare(String(b)));
      const d2Urls = Array.from(entry.d2).sort((a, b) => String(a).localeCompare(String(b)));
      const inD1 = d1Urls.length > 0;
      const inD2 = d2Urls.length > 0;

      let status = "unchanged";
      if (inD1 && !inD2) status = "lost";
      else if (!inD1 && inD2) status = "gained";
      else if (inD1 && inD2) status = "retained";

      return {
        prompt: rm.prompt,
        platform: rm.platform,
        d1: inD1 ? "yes" : "no",
        d2: inD2 ? "yes" : "no",
        status,
        d1Urls,
        d2Urls,
      };
    });

    return res.json({
      message: "My pages cited comparison fetched successfully",
      data: {
        rows,
        pagination: {
          currentPage: normalizedPage,
          totalPages,
          totalRows,
          pageSize,
          hasNextPage: normalizedPage < totalPages,
          hasPrevPage: normalizedPage > 1,
        },
        filters: {
          projectId,
          myPage: targetDomainRaw || null,
          d1: d1Key,
          d2: d2Key,
          statusFilter: effectiveStatusFilter,
          sortKey: effectiveSortKey,
          sortDir: effectiveSortDir,
        },
        summary: {
          totalPrompts: baselinePrompts.length,
          totalRows,
          totalRowsAll,
          statusFilter: effectiveStatusFilter,
          gained: statusCountsForSummary.gained,
          lost: statusCountsForSummary.lost,
          retained: statusCountsForSummary.retained,
          unchanged: statusCountsForSummary.unchanged,
          gainedAll: statusCountsAll.gained,
          lostAll: statusCountsAll.lost,
          retainedAll: statusCountsAll.retained,
          unchangedAll: statusCountsAll.unchanged,
          urlChangedPrompts:
            effectiveStatusFilter === "all" ? urlChangedRows : urlChangedRowsFiltered,
          totalD1Urls: effectiveStatusFilter === "all" ? totalD1Urls : totalD1UrlsFiltered,
          totalD2Urls: effectiveStatusFilter === "all" ? totalD2Urls : totalD2UrlsFiltered,
        },
        meta: {
          baselinePrompts: baselinePrompts.length,
        },
      },
    });
  } catch (err) {
    console.error("compareLLMMyPagesCitedByDates error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};

const compareLLMPagesMentioningMeByDates = async (req, res) => {
  try {
    const { filters, page = 1, limit = 50 } = req.query;
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const { projectId, platforms = [], myPage, d1, d2, statusFilter } = parsedFilters;

    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const project = await LLM.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.file_url) return res.status(400).json({ error: "Project has no file_url" });

    // Baseline prompts (Excel) - cached
    const UPLOAD_DIR = path.resolve(process.cwd(), "llm_uploads");
    const filename = path.basename(project.file_url);
    const candidateFromUploads = path.join(UPLOAD_DIR, filename);
    const candidateAbsolute = path.isAbsolute(project.file_url) ? project.file_url : null;

    let filePath = null;
    if (fs.existsSync(candidateFromUploads)) {
      filePath = candidateFromUploads;
    } else if (candidateAbsolute && fs.existsSync(candidateAbsolute)) {
      filePath = candidateAbsolute;
    } else {
      return res.status(404).json({
        error: "Uploaded file not found on server",
        tried: {
          candidateFromUploads,
          candidateAbsolute,
          originalFileUrl: project.file_url,
          uploadDir: UPLOAD_DIR,
        },
      });
    }

    let baselinePrompts = null;
    const promptCacheKey = `llmAdvanceFilterPrompts:${projectId}:${filename}`;
    const fileStat = fs.statSync(filePath);
    const cached = llmAdvanceFilterPromptCache.get(promptCacheKey);

    if (cached && cached.mtimeMs === fileStat.mtimeMs && Array.isArray(cached.prompts)) {
      baselinePrompts = cached.prompts;
    } else {
      const workbook = xlsx.readFile(filePath);
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ error: "Excel workbook has no sheets" });
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      if (!Array.isArray(excelRows) || excelRows.length === 0) {
        return res.json({
          message: "No rows in Excel sheet",
          data: {
            rows: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalRows: 0,
              pageSize: parseInt(limit, 10) || 50,
              hasNextPage: false,
              hasPrevPage: false,
            },
            meta: { baselinePrompts: 0 },
          },
        });
      }

      const headers = Object.keys(excelRows[0]);
      const keywordHeader = headers.find((h) => /keyword/i.test(h));
      if (!keywordHeader) {
        return res.status(400).json({
          error:
            "Excel must contain a 'Keyword' column (case-insensitive). Found headers: " +
            JSON.stringify(headers),
        });
      }

      const promptSet = new Set();
      for (const r of excelRows) {
        const raw = r[keywordHeader];
        const prompt = safeDecode(raw);
        if (!prompt) continue;
        promptSet.add(prompt);
      }

      baselinePrompts = Array.from(promptSet).sort((a, b) =>
        String(a).localeCompare(String(b))
      );

      llmAdvanceFilterPromptCache.set(promptCacheKey, {
        mtimeMs: fileStat.mtimeMs,
        prompts: baselinePrompts,
      });
    }

    // Project brands/competitors map (for CitationExtractor)
    const mainProject = { brand: project.brand, domain: project.target };
    const projectCompetitors = project?.competitors || [];
    const allBrands = [mainProject, ...projectCompetitors];
    const fixedCompetitors = allBrands.reduce((acc, competitor) => {
      acc[competitor.brand] = {
        brand: competitor.brand,
        domain: competitor.domain,
      };
      return acc;
    }, {});

    const brandName = project.brand;
    const myDomainRaw = myPage || project.target; // used only to exclude "my domain" URLs
    const myDomainNormalized = normalizeDomain(myDomainRaw || "");

    const ALL_LLM_TYPES = ["llm_chatgpt", "llm_gemini", "llm_perplexity", "llm_claude", "llm_aiMode"];
    const PLATFORM_MAP = {
      chatgpt: "llm_chatgpt",
      gemini: "llm_gemini",
      perplexity: "llm_perplexity",
      claude: "llm_claude",
      ai_overview: "llm_aiMode",
    };

    const LLM_TYPES =
      platforms.length > 0
        ? platforms.map((p) => PLATFORM_MAP[p]).filter(Boolean)
        : ALL_LLM_TYPES;

    const startOfDay = (dateStr) => {
      const dt = new Date(dateStr);
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const endOfDay = (dateStr) => {
      const dt = new Date(dateStr);
      dt.setHours(23, 59, 59, 999);
      return dt;
    };

    // Resolve default D1/D2 if not provided (oldest + latest task dates)
    let d1Key = d1 ? new Date(d1).toISOString().split("T")[0] : null;
    let d2Key = d2 ? new Date(d2).toISOString().split("T")[0] : null;

    if (!d1Key || !d2Key) {
      const oldestTask = await Task.findOne({
        project_id: projectId,
        task_type: { $in: LLM_TYPES },
      })
        .sort({ created_at: 1 })
        .select("created_at")
        .lean();

      const latestTask = await Task.findOne({
        project_id: projectId,
        task_type: { $in: LLM_TYPES },
      })
        .sort({ created_at: -1 })
        .select("created_at")
        .lean();

      if (!oldestTask || !latestTask) {
        return res.json({
          message: "No tasks found for this project",
          data: {
            rows: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalRows: 0,
              pageSize: parseInt(limit, 10) || 50,
              hasNextPage: false,
              hasPrevPage: false,
            },
            filters: {
              projectId,
              myPage: myDomainRaw || null,
              d1: null,
              d2: null,
            },
            meta: {
              baselinePrompts: baselinePrompts.length,
            },
          },
        });
      }

      const oldestKey = new Date(oldestTask.created_at).toISOString().split("T")[0];
      const latestKey = new Date(latestTask.created_at).toISOString().split("T")[0];
      if (!d1Key) d1Key = oldestKey;
      if (!d2Key) d2Key = latestKey;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 50, 1);
    const totalRows = baselinePrompts.length;
    const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 0;
    const normalizedPage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
    const start = (normalizedPage - 1) * pageSize;
    const pagedPrompts = baselinePrompts.slice(start, start + pageSize);
    const pagedPromptLookup = new Set(pagedPrompts);

    const d1Start = startOfDay(d1Key);
    const d1End = endOfDay(d1Key);
    const d2Start = startOfDay(d2Key);
    const d2End = endOfDay(d2Key);

    const taskQuery = {
      project_id: projectId,
      task_type: { $in: LLM_TYPES },
    };

    if (d1Key === d2Key) {
      taskQuery.created_at = { $gte: d1Start, $lte: d1End };
    } else {
      taskQuery.$or = [
        { created_at: { $gte: d1Start, $lte: d1End } },
        { created_at: { $gte: d2Start, $lte: d2End } },
      ];
    }

    const tasks = await Task.find(taskQuery).lean();

    // prompt -> { d1:Set<thirdpartyUrl>, d2:Set<thirdpartyUrl> }
    const promptToUrls = new Map();
    const promptToPlatforms = new Map();
    const TYPE_TO_PLATFORM = {
      llm_chatgpt: "chatgpt",
      llm_gemini: "gemini",
      llm_perplexity: "perplexity",
      llm_claude: "claude",
      llm_aiMode: "ai_overview",
    };

    const allowedPlatforms = new Set(Object.values(TYPE_TO_PLATFORM));
    const selectedPlatforms =
      Array.isArray(platforms) && platforms.length > 0
        ? platforms.map((p) => String(p).toLowerCase()).filter((p) => allowedPlatforms.has(p))
        : Array.from(allowedPlatforms);

    for (const task of tasks) {
      const taskDate = new Date(task.created_at);
      const taskDateKey = taskDate.toISOString().split("T")[0];
      if (taskDateKey !== d1Key && taskDateKey !== d2Key) continue;

      const prompt = safeDecode(task.data?.user_prompt || "");
      if (!prompt) continue;
      if (!pagedPromptLookup.has(prompt)) continue;

      const platformKey = TYPE_TO_PLATFORM[task.task_type] || null;
      if (platformKey) {
        if (!promptToPlatforms.has(prompt)) promptToPlatforms.set(prompt, new Set());
        promptToPlatforms.get(prompt).add(platformKey);
      }

      const extracted = CitationExtractor.extract(
        task.task_type,
        brandName,
        fixedCompetitors,
        task.results || [],
        project.target || null,
        taskDate
      );

      if (!extracted || !Array.isArray(extracted.allUrls)) continue;

      const cleanedUrls = extracted.allUrls.map(cleanUrl).filter(Boolean);
      const uniqueUrls = [...new Set(cleanedUrls)];

      if (!promptToUrls.has(prompt)) promptToUrls.set(prompt, { d1: new Set(), d2: new Set() });
      const entry = promptToUrls.get(prompt);

      for (const url of uniqueUrls) {
        const urlDomain = normalizeDomain(url);
        if (!urlDomain) continue;
        if (myDomainNormalized && urlDomain === myDomainNormalized) continue; // exclude my domain

        const nu = normalizeUrl(url);
        if (!nu) continue;
      if (taskDateKey === d1Key) entry.d1.add(nu);
      if (taskDateKey === d2Key) entry.d2.add(nu);
    }
  }

    // ------------------------------------
    // ✅ Keep only URLs whose fetched HTML contains the brand name
    // ------------------------------------
    const allUrlsSet = new Set();
    for (const entry of promptToUrls.values()) {
      entry.d1.forEach((u) => allUrlsSet.add(u));
      entry.d2.forEach((u) => allUrlsSet.add(u));
    }

    const allUrls = Array.from(allUrlsSet);
    if (allUrls.length > 0) {
      // schedule HTML fetches without blocking response time
      enqueueUrlFetch(allUrls).catch((err) =>
        console.error("enqueueUrlFetch failed:", err?.message || err)
      );
    }

    const fetchQuery = {
      url: { $in: allUrls },
      status: "completed",
      fetch_status_code: 200,
      fetch_response_html: { $ne: null },
    };

    const urlFetchDocs =
      allUrls.length > 0
        ? await UrlFetch.find(fetchQuery, { url: 1, fetch_response_html: 1 }).lean()
        : [];

    const mentionUrlSet = new Set();
    urlFetchDocs.forEach((doc) => {
      if (!doc?.url) return;
      if (detectBrandInHtml1(doc.fetch_response_html, brandName, project.target)) {
        mentionUrlSet.add(doc.url);
      }
    });

    const rows = pagedPrompts.map((prompt) => {
      const entry = promptToUrls.get(prompt) || { d1: new Set(), d2: new Set() };
      const platformSet = promptToPlatforms.get(prompt) || new Set();
      const d1Urls = Array.from(entry.d1).filter((u) => mentionUrlSet.has(u));
      const d2Urls = Array.from(entry.d2).filter((u) => mentionUrlSet.has(u));
      const platformsForPrompt = platformSet.size > 0 ? Array.from(platformSet) : selectedPlatforms;

      d1Urls.sort((a, b) => String(a).localeCompare(String(b)));
      d2Urls.sort((a, b) => String(a).localeCompare(String(b)));

      const inD1 = d1Urls.length > 0;
      const inD2 = d2Urls.length > 0;

      let status = "unchanged";
      if (inD1 && !inD2) status = "lost";
      else if (!inD1 && inD2) status = "gained";
      else if (inD1 && inD2) status = "retained";

      return {
        prompt,
        platforms: platformsForPrompt,
        d1: inD1 ? "yes" : "no",
        d2: inD2 ? "yes" : "no",
        status,
        d1Urls,
        d2Urls,
      };
    });

    const normalizedStatusFilter = String(statusFilter || "").toLowerCase();
    const filteredRows =
      normalizedStatusFilter && normalizedStatusFilter !== "all"
        ? rows.filter((r) => String(r.status || "").toLowerCase() === normalizedStatusFilter)
        : rows;

    const effectiveTotalRows =
      normalizedStatusFilter && normalizedStatusFilter !== "all" ? filteredRows.length : totalRows;
    const effectiveTotalPages =
      normalizedStatusFilter && normalizedStatusFilter !== "all"
        ? effectiveTotalRows > 0
          ? 1
          : 0
        : totalPages;
    const effectiveCurrentPage =
      normalizedStatusFilter && normalizedStatusFilter !== "all" ? 1 : normalizedPage;

    return res.json({
      message: "Pages mentioning me comparison fetched successfully",
      data: {
        rows: filteredRows,
        pagination: {
          currentPage: effectiveCurrentPage,
          totalPages: effectiveTotalPages,
          totalRows: effectiveTotalRows,
          pageSize,
          hasNextPage: effectiveCurrentPage < effectiveTotalPages,
          hasPrevPage: effectiveCurrentPage > 1,
        },
        filters: {
          projectId,
          myPage: myDomainRaw || null,
          d1: d1Key,
          d2: d2Key,
        },
        meta: {
          baselinePrompts: baselinePrompts.length,
        },
      },
    });
  } catch (err) {
    console.error("compareLLMPagesMentioningMeByDates error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};


module.exports = {
  getLLMProjects,
  exportLLMRankings,
  fetchLocationCode,
  getLLMRankings,
  editProject,
  deleteProject,
  getTotalCitations,
  getLLMCitationsAndRanks,
  getCompetitorsRankingsByDomain,
  downloadLLMRanks,
  getLLMPromptsWithUrls,
  getLLMPromptsByBrand,
  getMyPages,
  getMyPages1,
  getThirdPartyPages,
  CitationExtractor,
  getLLMPrompts,
  compareLLMBrandMentionsByDates,
  compareLLMMyPagesCitedByDates,
  compareLLMPagesMentioningMeByDates
};

