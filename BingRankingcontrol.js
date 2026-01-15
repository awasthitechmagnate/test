// const { default: mongoose } = require("mongoose");
// const Task = require("../models/Task");
// const moment = require("moment");
// const NodeCache = require("node-cache");
// const { readBingExcelFile, getKeywordCount } = require("../utils/helper");
// const Bing = require("../models/Bing");
// const xlsx = require("xlsx");


// const getProjects = async (req, res) => {
//   try {
//     // 1) Parse filter if provided
//     const parsedFilter = req.query.filter ? JSON.parse(req.query.filter) : {};
//     const { name, startDate, endDate } = parsedFilter;

//     // 2) Build MongoDB query
//     const query = { is_delete: false };

//     // Optional name search
//     if (name) {
//       query.name = { $regex: name, $options: "i" };
//     }

//     // Optional date range
//     if (startDate && endDate) {
//       query.created_at = {
//         $gte: new Date(`${startDate}T00:00:00.000Z`),
//         $lte: new Date(`${endDate}T23:59:59.999Z`),
//       };
//     }

//     // 3) Fetch projects
//     const projects = await Bing.find(query).sort({ created_at: -1 }).lean();

//     // 4) Attach keyword counts
//     for (let project of projects) {
//       const keywordCount = await getKeywordCount(project.file_url, "bing_ranking");
//       project.total_keywords = keywordCount;
//     }

//     return res.json({ projects });
//   } catch (err) {
//     console.error("get Bing Projects error:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

// const editProject = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, target, frequency, is_active } = req.body;

//     const updatedProject = await Bing.findByIdAndUpdate(
//       id,
//       { name, target, frequency, is_active },
//       { new: true, runValidators: true }
//     );

//     if (!updatedProject) {
//       return res.status(404).json({ message: "Project not found" });
//     }

//     res.json({
//       message: "Project updated successfully",
//       project: updatedProject,
//     });
//   } catch (error) {
//     console.error("Error updating project:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// }

// const deleteProject = async (req, res) => {
//   try {
//     const { id } = req.params;

//     let project = await Bing.findById(id)

//     project.is_delete = true
//     await project.save()

//     res.json({
//       message: "Project deleted successfully",
//       project: project,
//     });
//   } catch (error) {
//     console.error("Error updating project:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// }

// const excelCache = new NodeCache({ stdTTL: 300, useClones: false });

// // Utility: get (and cache) Excel data
// async function getCachedExcelData(projectId) {
//   const key = `excelData:${projectId}`;
//   let data = excelCache.get(key);
//   if (!data) {
//     data = await readBingExcelFile(projectId);
//     excelCache.set(key, data);
//   }
//   return data;
// }

// // Utility: filter Excel rows for matching keywords
// // function extractKeywords(data, { category, subCategory, brand }) {
// //   const hasFilters = !!(category || subCategory || brand);
// //   return data.reduce((set, { Category, SubCategory, Brand, Keywords }) => {
// //     if (
// //       !hasFilters ||
// //       (category && Category === category) ||
// //       (subCategory && SubCategory === subCategory) ||
// //       (brand && Brand === brand)
// //     ) {
// //       set.add(Keywords);
// //     }
// //     return set;
// //   }, new Set());
// // }

// function extractKeywords(data, { category, subCategory, brand }) {
//   const hasFilters = !!(category || subCategory || brand);
  

//   return data.reduce((set, row) => {
//     if (!hasFilters) {
//       if (row.Keywords) set.add(row.Keywords);
//       return set;
//     }

//     if (
//       (category &&
//         row.Category?.toLowerCase() !== category.toLowerCase()) ||
//       (subCategory &&
//         row.SubCategory?.toLowerCase() !== subCategory.toLowerCase()) ||
//       (brand &&
//         row.Brand?.toLowerCase() !== brand.toLowerCase())
//     ) {
//       return set; // ❌ reject this row
//     }

//     if (row.Keywords) {
//       set.add(row.Keywords);
//     }

//     return set;
//   }, new Set());
 
// }



// // Utility: group tasks by keyword + date for the "keywordRanking" tab
// function groupByKeyword(tasks, allDates) {
//   const keywordMap = {};

//   tasks.forEach((doc) => {
//     const dateKey = moment.utc(doc.created_at).format("YY/MM/DD");
//     const key = doc.keyword.toLowerCase();
//     const ranks = doc.results
//       .map((r) => r.rank_group)
//       .filter((r) => r != null);

//     if (!keywordMap[key]) {
//       keywordMap[key] = {
//         _id: key,
//         keyword: doc.keyword,
//         ...allDates.reduce((acc, d) => ({ ...acc, [d]: "" }), {}),
//         children: {},
//       };
//     }

//     keywordMap[key][dateKey] = ranks.length ? Math.min(...ranks) : "101";

//     doc.results.forEach((r) => {
//       if (r.url && r.rank_group != null) {
//         const urlKey = r.url;
//         if (!keywordMap[key].children[urlKey]) {
//           keywordMap[key].children[urlKey] = {
//             _id: `${key}-${urlKey}`,
//             keyword: urlKey,
//             parentId: key,
//             url: urlKey,
//             ...allDates.reduce((acc, d) => ({ ...acc, [d]: "" }), {}),
//           };
//         }
//         keywordMap[key].children[urlKey][dateKey] = r.rank_group;
//       }
//     });
//   });

//   return Object.values(keywordMap).map((item) => {
//     item.children = Object.values(item.children);
//     return item;
//   });
// }

// // Utility: group tasks by URL + keyword children for "urlRanking"
// function groupByURL(tasks, allDates) {
//   const urlMap = {};

//   tasks.forEach((doc) => {
//     const dateKey = moment(doc.created_at).format("YY/MM/DD");
//     doc.results.forEach((r) => {
//       if (!r.url) return;
//       const urlKey = r.url.toLowerCase();
//       const rank = r.rank_group ?? r.rank_group ?? 101;

//       if (!urlMap[urlKey]) {
//         urlMap[urlKey] = {
//           _id: urlKey,
//           url: r.url,
//           ...allDates.reduce((acc, d) => ({ ...acc, [d]: 101 }), {}),
//           children: [],
//         };
//       }

//       urlMap[urlKey][dateKey] = Math.min(urlMap[urlKey][dateKey], rank);

//       let child = urlMap[urlKey].children.find((c) => c.url === doc.keyword);
//       if (!child) {
//         child = {
//           _id: `${urlKey}-${doc.keyword}`,
//           parentId: urlKey,
//           url: doc.keyword,
//           ...allDates.reduce((acc, d) => ({ ...acc, [d]: 101 }), {}),
//         };
//         urlMap[urlKey].children.push(child);
//       }
//       child[dateKey] = rank;
//     });
//   });

//   return Object.values(urlMap);
// }
// // -----------------------------------------------------
// // const getBingRanking = async (req, res) => {
// //   try {
// //     const page = Math.max(1, parseInt(req.query.page) || 1);
// //     const limit = Math.max(1, parseInt(req.query.limit) || 10);
// //     const filterQuery = req.query.filter ? JSON.parse(req.query.filter) : {};
// //     const {
// //       project: projectId,
// //       startDate,
// //       endDate,
// //       result_type,
// //       keyword,
// //       tab, 
// //       brand,
// //     category,
// //     subCategory
// //     } = filterQuery;

// //     if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
// //       return res.status(400).json({ error: "Invalid project ID" });
// //     }
// //     const projObjId = new mongoose.Types.ObjectId(projectId);

// //     const data = await getCachedExcelData(projectId);
// //     const allKeywordsSet = extractKeywords(data, filterQuery);
// //     const allKeywords = Array.from(allKeywordsSet);

// //     const query = {
// //       project_id: projObjId,
// //       status: "Completed",
// //       task_type: "bing"
// //       // results: { $exists: true, $not: { $size: 0 } },
// //     };

// //     if (startDate && endDate) {
// //       const start = new Date(startDate);
// //       const end = new Date(endDate);
// //       end.setHours(23, 59, 59, 999);
// //       query.created_at = { $gte: start, $lte: end };
// //     }
// //     if (result_type) {
// //       query["results"] = { $elemMatch: { type: result_type } };
// //     }
// //     if (keyword) {
// //       query.keyword = new RegExp(keyword, "i");
// //     }

// //     const allTasksQuery = { ...query };
// //     if (allKeywords.length && !keyword) {
// //       allTasksQuery.keyword = { $in: allKeywords };
// //     }

// //     const tasks = await Task.find(allTasksQuery)
// //       .sort({ created_at: -1 })
// //       .lean();

// //     const uniqueDates = [
// //       ...new Set(tasks.map((t) => moment.utc(t.created_at).format("YY/MM/DD"))),
// //     ].sort((a, b) => (a < b ? 1 : -1));

// //     const totalDocs = allKeywords.length;

// //     if (tab === "keywordRanking") {
// //       const formatted = groupByKeyword(tasks, uniqueDates);
// //       const pagedFormatted = formatted.slice((page - 1) * limit, page * limit);
// //       return res.json({
// //         tasks: pagedFormatted,
// //         totalPages: Math.ceil(formatted.length / limit),
// //         uniqueDates,
// //         currentPage: page,
// //         totalTasks: formatted.length,
// //       });
// //     }

// //     if (tab === "urlRanking") {
// //       const formatted = groupByURL(tasks, uniqueDates);
// //       const paged = formatted.slice((page - 1) * limit, page * limit);
// //       return res.json({
// //         tasks: paged,
// //         totalPages: Math.ceil(formatted.length / limit),
// //         uniqueDates,
// //         currentPage: page,
// //         totalTasks: formatted.length,
// //       });
// //     }

// //     return res.json({
// //       tasks: [],
// //       totalPages: 0,
// //       uniqueDates,
// //       currentPage: page,
// //       totalTasks: 0,
// //     });
// //   } catch (err) {
// //     console.error("get bing raanking error:", err);
// //     return res.status(500).json({ error: err.message });
// //   }
// // };



// const getBingRanking = async (req, res) => {
//   try {
//     const page = Math.max(1, Number(req.query.page) || 1);
//     const limit = Math.max(1, Number(req.query.limit) || 10);

//     let filterQuery = {};
//     if (req.query.filter) {
//       try {
//         filterQuery = JSON.parse(req.query.filter);
//       } catch (e) {
//         return res.status(400).json({ error: "Invalid filter JSON" });
//       }
//     }

//     const {
//       project: projectId,
//       startDate,
//       endDate,
//       result_type,
//       keyword,
//       tab,
//       brand,
//       category,
//       subCategory,
//     } = filterQuery;

//     if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
//       return res.status(400).json({ error: "Invalid project ID" });
//     }

//     const projObjId = new mongoose.Types.ObjectId(projectId);

//     const excelData = await getCachedExcelData(projectId);
//     const allKeywords = Array.from(
//       extractKeywords(excelData, filterQuery)
//     );

//     const query = {
//       project_id: projObjId,
//       status: "Completed",
//       task_type: "bing",
//     };

//     if (startDate && endDate) {
//       const start = new Date(startDate);
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       query.created_at = { $gte: start, $lte: end };
//     }

//     if (result_type) {
//       query.results = { $elemMatch: { type: result_type } };
//     }

//     if (keyword) {
//       query.keyword = new RegExp(keyword, "i");
//     } else if (allKeywords.length) {
//       query.keyword = { $in: allKeywords };
//     }

//     const tasks = await Task.find(query)
//       .sort({ created_at: -1 })
//       .lean();

//     const uniqueDates = [
//       ...new Set(
//         tasks.map(t => moment.utc(t.created_at).format("YY/MM/DD"))
//       ),
//     ].sort((a, b) => (a < b ? 1 : -1));

//     if (tab === "keywordRanking") {
//       const formatted = groupByKeyword(tasks, uniqueDates);
//       const paged = formatted.slice((page - 1) * limit, page * limit);

//       return res.json({
//         tasks: paged,
//         uniqueDates,
//         currentPage: page,
//         totalPages: Math.ceil(formatted.length / limit),
//         totalTasks: formatted.length,
//       });
//     }

//     if (tab === "urlRanking") {
//       const formatted = groupByURL(tasks, uniqueDates);
//       const paged = formatted.slice((page - 1) * limit, page * limit);

//       return res.json({
//         tasks: paged,
//         uniqueDates,
//         currentPage: page,
//         totalPages: Math.ceil(formatted.length / limit),
//         totalTasks: formatted.length,
//       });
//     }

//     return res.json({
//       tasks: [],
//       uniqueDates,
//       currentPage: page,
//       totalPages: 0,
//       totalTasks: 0,
//     });
//   } catch (err) {
//     console.error("getBingRanking error:", err);
//     return res.status(500).json({ error: err.message });
//   }
// };


// // const exportExcel = async (req, res) => {
// //   try {
// //     const filterQuery = req.query.filter ? JSON.parse(req.query.filter) : {};
// //     const { project: projectId, startDate, endDate, keyword } = filterQuery;

// //     if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
// //       return res.status(400).json({ error: "Invalid project ID" });
// //     }
// //     const projObjId = new mongoose.Types.ObjectId(projectId);

// //     const data = await getCachedExcelData(projectId);
// //     const allKeywordsSet = extractKeywords(data, filterQuery);
// //     const allKeywords = Array.from(allKeywordsSet);

// //     const query = {
// //       project_id: projObjId,
// //       status: "Completed",
// //       task_type: "bing",
// //       results: { $exists: true, $not: { $size: 0 } },
// //     };

// //     if (startDate && endDate) {
// //       const start = new Date(startDate);
// //       const end = new Date(endDate);
// //       end.setHours(23, 59, 59, 999);
// //       query.created_at = { $gte: start, $lte: end };
// //     }

// //     if (keyword) {
// //       query.keyword = new RegExp(keyword, "i");
// //     }

// //     const allTasksQuery = { ...query };
// //     if (allKeywords.length && !keyword) {
// //       allTasksQuery.keyword = { $in: allKeywords };
// //     }

// //     const tasks = await Task.find(allTasksQuery)
// //       .sort({ created_at: -1 })
// //       .lean();

// //     const uniqueDates = [
// //       ...new Set(tasks.map((t) => moment.utc(t.created_at).format("YY/MM/DD"))),
// //     ].sort((a, b) => (a < b ? 1 : -1));







// const exportExcel = async (req, res) => {
//   try {
//     let filterQuery = {};
//     if (req.query.filter) {
//       try {
//         filterQuery = JSON.parse(req.query.filter);
//       } catch (e) {
//         return res.status(400).json({ error: "Invalid filter JSON" });
//       }
//     }

//     const {
//       project: projectId,
//       startDate,
//       endDate,
//       keyword,
//       brand,
//       category,
//       subCategory,
//     } = filterQuery;

//     if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
//       return res.status(400).json({ error: "Invalid project ID" });
//     }

//     const projObjId = new mongoose.Types.ObjectId(projectId);

//     const excelData = await getCachedExcelData(projectId);
//     const allKeywords = Array.from(
//       extractKeywords(excelData, filterQuery)
//     );

//     const query = {
//       project_id: projObjId,
//       status: "Completed",
//       task_type: "bing",
//       results: { $exists: true, $not: { $size: 0 } },
//     };

//     if (startDate && endDate) {
//       const start = new Date(startDate);
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       query.created_at = { $gte: start, $lte: end };
//     }

//     if (keyword) {
//       query.keyword = new RegExp(keyword, "i");
//     } else if (allKeywords.length) {
//       query.keyword = { $in: allKeywords };
//     }

//     const tasks = await Task.find(query)
//       .sort({ created_at: -1 })
//       .lean();

//     const uniqueDates = [
//       ...new Set(
//         tasks.map(t => moment.utc(t.created_at).format("YY/MM/DD"))
//       ),
//     ].sort((a, b) => (a < b ? 1 : -1));

//     // continue your Excel generation logic here
//     return res.json({ tasks, uniqueDates });
//   } catch (err) {
//     console.error("exportExcel error:", err);
//     return res.status(500).json({ error: err.message });
//   }
// };


//     // -------- KEYWORD RANKINGS --------
//     const keywordFormatted = groupByKeyword(tasks, uniqueDates);
//     const keywordRows = keywordFormatted.map((item) => {
//       const row = { Keyword: item.keyword };
//       uniqueDates.forEach((date) => {
//         let formattedDate = moment(date, "YY/MM/DD").format("DD MMM YYYY");
//         row[formattedDate] = item[date] || "";
//       });
//       return row;
//     });

//     // -------- URL RANKINGS --------
//     const urlFormatted = groupByURL(tasks, uniqueDates);
//     const urlRows = urlFormatted.map((item) => {
//       const row = { URL: item.url }; // assuming groupByURL gives `url` field
//       uniqueDates.forEach((date) => {
//         let formattedDate = moment(date, "YY/MM/DD").format("DD MMM YYYY");
//         row[formattedDate] = item[date] || "";
//       });
//       return row;
//     });

//     // -------- CREATE WORKBOOK --------
//     const workbook = xlsx.utils.book_new();

//     // Sheet 1: Keyword Rankings
//     const keywordWs = xlsx.utils.json_to_sheet(keywordRows);
//     xlsx.utils.book_append_sheet(workbook, keywordWs, "Bing Keyword Rankings");

//     // Sheet 2: URL Rankings
//     const urlWs = xlsx.utils.json_to_sheet(urlRows);
//     xlsx.utils.book_append_sheet(workbook, urlWs, "Bing URL Rankings");

//     // Write workbook to buffer
//     const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.setHeader(
//       "Content-Disposition",
//       "attachment; filename=bing_ranking.xlsx"
//     );

//     return res.send(buffer);
//   } catch (err) {
//     console.error("exportBingRanking error:", err);
//     return res.status(500).json({ error: err.message });
//   }
// };


// module.exports = {
//   getProjects,
//   getBingRanking,
//   exportExcel,
//   editProject,
//   deleteProject
// };




// ----------------------------------------------





const { default: mongoose } = require("mongoose");
const Task = require("../models/Task");
const moment = require("moment");
const NodeCache = require("node-cache");
const { readBingExcelFile, getKeywordCount } = require("../utils/helper");
const Bing = require("../models/Bing");
const xlsx = require("xlsx");

const excelCache = new NodeCache({ stdTTL: 300, useClones: false });

// ----------------- UTILITY FUNCTIONS -----------------

// Get cached Excel data
async function getCachedExcelData(projectId) {
  const key = `excelData:${projectId}`;
  let data = excelCache.get(key);
  if (!data) {
    data = await readBingExcelFile(projectId);
    excelCache.set(key, data);
  }
  return data;
}

// Extract keywords from Excel with filters
// function extractKeywords(data, { category, subCategory, brand }) {
//   const hasFilters = !!(category || subCategory || brand);

//   const filteredSet = data.reduce((set, row) => {
//     if (!hasFilters) {
//       if (row.Keywords) set.add(row.Keywords);
//       return set;
//     }

//     if (
//       (category && row.Category?.toLowerCase() !== category.toLowerCase()) ||
//       (subCategory && row.SubCategory?.toLowerCase() !== subCategory.toLowerCase()) ||
//       (brand && row.Brand?.toLowerCase() !== brand.toLowerCase())
//     ) {
//       return set; // reject this row
//     }

//     if (row.Keywords) set.add(row.Keywords);

//     return set;
//   }, new Set());

//   return filteredSet;
// }



function extractKeywords(data, { category, subCategory, brand }) {
  const hasFilters = !!(category || subCategory || brand);

  console.log("=== FILTER DEBUG ===");
  console.log("Category filter:", category);
  console.log("SubCategory filter:", subCategory);
  console.log("Brand filter:", brand);
  console.log("Total rows in Excel:", data.length);

  const filteredSet = data.reduce((set, row) => {
    if (!hasFilters) {
      if (row.Keywords) set.add(row.Keywords);
      return set;
    }

    if (
      (category && row.Category?.toLowerCase() !== category.toLowerCase()) ||
      (subCategory && row.SubCategory?.toLowerCase() !== subCategory.toLowerCase()) ||
      (brand && row.Brand?.toLowerCase() !== brand.toLowerCase())
    ) {
      return set; // reject this row
    }

    if (row.Keywords) set.add(row.Keywords);
    return set;
  }, new Set());

  console.log("Filtered keywords count:", filteredSet.size);
  console.log("Sample filtered keywords:", Array.from(filteredSet).slice(0, 5));

  return filteredSet;
}


// Group by keyword for "keywordRanking" tab
function groupByKeyword(tasks, allDates) {
  const keywordMap = {};

  tasks.forEach((doc) => {
    const dateKey = moment.utc(doc.created_at).format("YY/MM/DD");
    const key = doc.keyword.toLowerCase();
    const ranks = doc.results.map((r) => r.rank_group).filter((r) => r != null);

    if (!keywordMap[key]) {
      keywordMap[key] = {
        _id: key,
        keyword: doc.keyword,
        ...allDates.reduce((acc, d) => ({ ...acc, [d]: "" }), {}),
        children: {},
      };
    }

    keywordMap[key][dateKey] = ranks.length ? Math.min(...ranks) : "101";

    doc.results.forEach((r) => {
      if (r.url && r.rank_group != null) {
        const urlKey = r.url;
        if (!keywordMap[key].children[urlKey]) {
          keywordMap[key].children[urlKey] = {
            _id: `${key}-${urlKey}`,
            keyword: urlKey,
            parentId: key,
            url: urlKey,
            ...allDates.reduce((acc, d) => ({ ...acc, [d]: "" }), {}),
          };
        }
        keywordMap[key].children[urlKey][dateKey] = r.rank_group;
      }
    });
  });

  return Object.values(keywordMap).map((item) => {
    item.children = Object.values(item.children);
    return item;
  });
}

// Group by URL for "urlRanking" tab
function groupByURL(tasks, allDates) {
  const urlMap = {};

  tasks.forEach((doc) => {
    const dateKey = moment(doc.created_at).format("YY/MM/DD");

    doc.results.forEach((r) => {
      if (!r.url) return;
      const urlKey = r.url.toLowerCase();
      const rank = r.rank_group ?? 101;

      if (!urlMap[urlKey]) {
        urlMap[urlKey] = {
          _id: urlKey,
          url: r.url,
          ...allDates.reduce((acc, d) => ({ ...acc, [d]: 101 }), {}),
          children: [],
        };
      }

      urlMap[urlKey][dateKey] = Math.min(urlMap[urlKey][dateKey], rank);

      let child = urlMap[urlKey].children.find((c) => c.url === doc.keyword);
      if (!child) {
        child = {
          _id: `${urlKey}-${doc.keyword}`,
          parentId: urlKey,
          url: doc.keyword,
          ...allDates.reduce((acc, d) => ({ ...acc, [d]: 101 }), {}),
        };
        urlMap[urlKey].children.push(child);
      }
      child[dateKey] = rank;
    });
  });

  return Object.values(urlMap);
}

// ----------------- CONTROLLER FUNCTIONS -----------------

// Get all Bing projects with optional filter
const getProjects = async (req, res) => {
  try {
    const parsedFilter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const { name, startDate, endDate } = parsedFilter;

    const query = { is_delete: false };
    if (name) query.name = { $regex: name, $options: "i" };
    if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    }

    const projects = await Bing.find(query).sort({ created_at: -1 }).lean();

    for (let project of projects) {
      const keywordCount = await getKeywordCount(project.file_url, "bing_ranking");
      project.total_keywords = keywordCount;
    }

    return res.json({ projects });
  } catch (err) {
    console.error("getProjects error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// // Get Bing ranking (keyword or URL)
// const getBingRanking = async (req, res) => {
//   try {
//     const page = Math.max(1, Number(req.query.page) || 1);
//     const limit = Math.max(1, Number(req.query.limit) || 10);

//     let filterQuery = {};
//     if (req.query.filter) {
//       try { filterQuery = JSON.parse(req.query.filter); } 
//       catch { return res.status(400).json({ error: "Invalid filter JSON" }); }
//     }

//     const { project: projectId, startDate, endDate, result_type, keyword, tab, brand, category, subCategory } = filterQuery;

//     if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
//       return res.status(400).json({ error: "Invalid project ID" });
//     }
//     const projObjId = new mongoose.Types.ObjectId(projectId);

//     const excelData = await getCachedExcelData(projectId);
//     const allKeywords = Array.from(extractKeywords(excelData, filterQuery));

//     console.log("FILTER RECEIVED:", filterQuery);
//     console.log("TOTAL EXCEL ROWS:", excelData.length);
//     console.log("FILTERED KEYWORDS COUNT:", allKeywords.length);
//     console.log("SAMPLE FILTERED KEYWORDS:", allKeywords.slice(0, 5));

//     const query = {
//       project_id: projObjId,
//       status: "Completed",
//       task_type: "bing",
//     };

//     if (startDate && endDate) {
//       const start = new Date(startDate);
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       query.created_at = { $gte: start, $lte: end };
//     }

//     if (result_type) query.results = { $elemMatch: { type: result_type } };

//     if (keyword) query.keyword = new RegExp(keyword, "i");
//     else if (allKeywords.length) query.keyword = { $in: allKeywords.map(k => new RegExp(`^${k}$`, "i")) };

//     console.log("FINAL TASK QUERY:", JSON.stringify(query, null, 2));

//     const tasks = await Task.find(query).sort({ created_at: -1 }).lean();
//     console.log("TOTAL TASKS FETCHED:", tasks.length);

//     const uniqueDates = [...new Set(tasks.map(t => moment.utc(t.created_at).format("YY/MM/DD")))]
//       .sort((a, b) => (a < b ? 1 : -1));

//     if (tab === "keywordRanking") {
//       const formatted = groupByKeyword(tasks, uniqueDates);
//       const paged = formatted.slice((page - 1) * limit, page * limit);
//       return res.json({
//         tasks: paged,
//         uniqueDates,
//         currentPage: page,
//         totalPages: Math.ceil(formatted.length / limit),
//         totalTasks: formatted.length,
//       });
//     }

//     if (tab === "urlRanking") {
//       const formatted = groupByURL(tasks, uniqueDates);
//       const paged = formatted.slice((page - 1) * limit, page * limit);
//       return res.json({
//         tasks: paged,
//         uniqueDates,
//         currentPage: page,
//         totalPages: Math.ceil(formatted.length / limit),
//         totalTasks: formatted.length,
//       });
//     }

//     return res.json({ tasks: [], uniqueDates, currentPage: page, totalPages: 0, totalTasks: 0 });
//   } catch (err) {
//     console.error("getBingRanking error:", err);
//     return res.status(500).json({ error: err.message });
//   }
// };


const getBingRanking = async (req, res) => {
  try {console.log("Filter received:", req.query.filter);

    // ------------------ Pagination ------------------
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);

    // ------------------ Parse Filter ------------------
    let filterQuery = {};
    if (req.query.filter) {
      try {
        filterQuery = JSON.parse(req.query.filter);
      } catch {
        return res.status(400).json({ error: "Invalid filter JSON" });
      }
    }

    const { project: projectId, startDate, endDate, result_type, keyword, tab, brand, category, subCategory } = filterQuery;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    const projObjId = new mongoose.Types.ObjectId(projectId);

    // ------------------ Get Excel Data ------------------
    const excelData = await getCachedExcelData(projectId);
    console.log("TOTAL EXCEL ROWS:", excelData.length);
    console.log("EXCEL SAMPLE ROWS:", excelData.slice(0, 5));

    // ------------------ Extract Keywords ------------------
    const allKeywords = Array.from(
      extractKeywords(excelData, { category, subCategory, brand })
    );
    console.log("FILTER RECEIVED:", { category, subCategory, brand });
    console.log("FILTERED KEYWORDS COUNT:", allKeywords.length);
    console.log("SAMPLE FILTERED KEYWORDS:", allKeywords.slice(0, 5));

    // ------------------ Build MongoDB Query ------------------
    const query = {
      project_id: projObjId,
      status: "Completed",
      task_type: "bing",
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.created_at = { $gte: start, $lte: end };
    }

    if (result_type) {
      query.results = { $elemMatch: { type: result_type } };
    }

    if (keyword) {
      query.keyword = new RegExp(keyword, "i");
    } else if (allKeywords.length) {
      // Use case-insensitive exact match for all filtered keywords
      query.keyword = { $in: allKeywords.map(k => new RegExp(`^${k}$`, "i")) };
    }

    console.log("FINAL TASK QUERY:", JSON.stringify(query, null, 2));

    // ------------------ Fetch Tasks ------------------
    const tasks = await Task.find(query)
      .sort({ created_at: -1 })
      .lean();
    console.log("TOTAL TASKS FETCHED:", tasks.length);
    console.log("SAMPLE TASKS:", tasks.slice(0, 3));

    // ------------------ Prepare Unique Dates ------------------
    const uniqueDates = [
      ...new Set(tasks.map(t => moment.utc(t.created_at).format("YY/MM/DD")))
    ].sort((a, b) => (a < b ? 1 : -1));

    // ------------------ Format for Keyword Ranking ------------------
    if (tab === "keywordRanking") {
      const formatted = groupByKeyword(tasks, uniqueDates);
      const paged = formatted.slice((page - 1) * limit, page * limit);

      return res.json({
        tasks: paged,
        uniqueDates,
        currentPage: page,
        totalPages: Math.ceil(formatted.length / limit),
        totalTasks: formatted.length,
      });
    }

    // ------------------ Format for URL Ranking ------------------
    if (tab === "urlRanking") {
      const formatted = groupByURL(tasks, uniqueDates);
      const paged = formatted.slice((page - 1) * limit, page * limit);

      return res.json({
        tasks: paged,
        uniqueDates,
        currentPage: page,
        totalPages: Math.ceil(formatted.length / limit),
        totalTasks: formatted.length,
      });
    }

    // ------------------ Default Empty Response ------------------
    return res.json({
      tasks: [],
      uniqueDates,
      currentPage: page,
      totalPages: 0,
      totalTasks: 0,
    });

  } catch (err) {
    console.error("getBingRanking error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ------------------ Improved extractKeywords ------------------
function extractKeywords(data, { category, subCategory, brand }) {
  const hasFilters = !!(category || subCategory || brand);

  const result = data.reduce((set, row) => {
    if (!hasFilters) {
      if (row.Keywords) set.add(row.Keywords);
      return set;
    }

    // Skip rows not matching filters
    if ((category && row.Category?.toLowerCase() !== category.toLowerCase()) ||
        (subCategory && row.SubCategory?.toLowerCase() !== subCategory.toLowerCase()) ||
        (brand && row.Brand?.toLowerCase() !== brand.toLowerCase())) {
      console.log("ROW SKIPPED:", row.Keywords, row.Category, row.SubCategory, row.Brand);
      return set;
    }

    if (row.Keywords) {
      set.add(row.Keywords);
      console.log("ROW ACCEPTED:", row.Keywords, row.Category, row.SubCategory, row.Brand);
    }

    return set;
  }, new Set());

  return result;
}

module.exports = { getBingRanking };


// Export Excel file
const exportExcel = async (req, res) => {
  try {
    let filterQuery = {};
    if (req.query.filter) {
      try { filterQuery = JSON.parse(req.query.filter); } 
      catch { return res.status(400).json({ error: "Invalid filter JSON" }); }
    }

    const { project: projectId, startDate, endDate, keyword, brand, category, subCategory } = filterQuery;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    const projObjId = new mongoose.Types.ObjectId(projectId);

    const excelData = await getCachedExcelData(projectId);
    const allKeywords = Array.from(extractKeywords(excelData, filterQuery));

    const query = {
      project_id: projObjId,
      status: "Completed",
      task_type: "bing",
      results: { $exists: true, $not: { $size: 0 } },
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.created_at = { $gte: start, $lte: end };
    }

    if (keyword) query.keyword = new RegExp(keyword, "i");
    else if (allKeywords.length) query.keyword = { $in: allKeywords.map(k => new RegExp(`^${k}$`, "i")) };

    const tasks = await Task.find(query).sort({ created_at: -1 }).lean();
    const uniqueDates = [...new Set(tasks.map(t => moment.utc(t.created_at).format("YY/MM/DD")))]
      .sort((a, b) => (a < b ? 1 : -1));

    // Generate Excel
    const keywordRows = groupByKeyword(tasks, uniqueDates).map((item) => {
      const row = { Keyword: item.keyword };
      uniqueDates.forEach((date) => {
        const formattedDate = moment(date, "YY/MM/DD").format("DD MMM YYYY");
        row[formattedDate] = item[date] || "";
      });
      return row;
    });

    const urlRows = groupByURL(tasks, uniqueDates).map((item) => {
      const row = { URL: item.url };
      uniqueDates.forEach((date) => {
        const formattedDate = moment(date, "YY/MM/DD").format("DD MMM YYYY");
        row[formattedDate] = item[date] || "";
      });
      return row;
    });

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(keywordRows), "Bing Keyword Rankings");
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(urlRows), "Bing URL Rankings");

    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=bing_ranking.xlsx");
    return res.send(buffer);
  } catch (err) {
    console.error("exportExcel error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Edit and delete
const editProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, target, frequency, is_active } = req.body;

    const updatedProject = await Bing.findByIdAndUpdate(
      id,
      { name, target, frequency, is_active },
      { new: true, runValidators: true }
    );

    if (!updatedProject) return res.status(404).json({ message: "Project not found" });

    return res.json({ message: "Project updated successfully", project: updatedProject });
  } catch (err) {
    console.error("editProject error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Bing.findById(id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    project.is_delete = true;
    await project.save();
    return res.json({ message: "Project deleted successfully", project });
  } catch (err) {
    console.error("deleteProject error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ----------------- EXPORT MODULE -----------------
module.exports = {
  getProjects,
  getBingRanking,
  exportExcel,
  editProject,
  deleteProject,
};
