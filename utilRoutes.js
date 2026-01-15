const express = require("express");
const axios = require("axios");
const Language = require("../models/Language");
const Country = require("../models/Country");
const Location = require("../models/Location");
const Task = require("../models/Task");
const Project = require("../models/Project");
const Keyword = require("../models/Keyword");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const SearchVolume = require("../models/SearchVolume");
const { readExcelFile, readLocalExcelFile, readBingExcelFile } = require("../utils/helper");
const { default: mongoose } = require("mongoose");
const LocalTask = require("../models/LocalTask");
const LocalProject = require("../models/LocalProject");
const BingTask = require("../models/BingTask");
const AllRankKeyword = require("../models/AllRankKeyword");
const AIMode = require("../models/AIMode");
const AppRanking = require("../models/AppRanking");
const Bing = require("../models/Bing");
const Youtube = require("../models/Youtube");
const LLM = require("../models/LLM");

const { Queue } = require("bullmq");
const connection = require("../services/queues/bullmqConnection");

const notifyQueue = new Queue("notifyQueue", { connection });
const zlib = require("zlib");
const postbackKeywordsQueue = require("../services/queues/postbackKeywordsQueue");
const PostbackNotifyQueue = require("../services/queues/PostbackNotifyQueue");

require("dotenv").config();
const normalizeDomain = (domain) => {
  if (!domain) return "";
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
};
const router = express.Router();
Location.collection.createIndex({ location_name: "text" });

router.get("/get_language", async (req, res) => {
  try {
    const languagesInDb = await Language.find({});

    if (languagesInDb.length > 0) {
      return res.json({ source: "database", tasks: languagesInDb });
    }

    const response = await axios({
      method: "get",
      url: "https://api.dataforseo.com/v3/serp/google/organic/languages",
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const languages = response.data.tasks[0].result;

    const savedLanguages = await Language.insertMany(
      languages.map((lang) => ({
        language_code: lang.language_code,
        language_name: lang.language_name,
      }))
    );

    res.json({ source: "api", tasks: savedLanguages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/get_countries", async (req, res) => {
  try {
    const countriesInDb = await Country.find({}).select("name iso2");

    if (countriesInDb.length > 0) {
      return res.json({ source: "database", tasks: countriesInDb });
    } else {
      return res.json({ source: "database", tasks: [] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/get_location", async (req, res) => {
  try {
    let country = req.query.country;
    country = country.toLowerCase();
    const response = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/serp/google/locations/${country}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
      headers: {
        "content-type": "application/json",
      },
    });

    return res.json({
      source: "api",
      tasks: response.data.tasks[0].result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const getLocation = async (country) => {
  const response = axios({
    method: "get",
    url: "https://api.dataforseo.com/v3/serp/google/locations",
    auth: {
      username: process.env.API_USERNAME,
      password: process.env.API_PASSWORD,
    },
    data: [
      {
        country: "us",
      },
    ],
    headers: {
      "content-type": "application/json",
    },
  })
    .then(function (response) {
      var result = response["data"]["tasks"][0]["result"];
      const jsonData = JSON.stringify(result, null, 2);

      // Save to a file
      fs.writeFileSync("result.json", jsonData, "utf-8");
      return result;
    })
    .catch(function (error) {
      console.log(error);
    });

  return response;
};

router.get("/search_location", async (req, res) => {
  try {
    let { query, country_code, page = 1, limit = 20 } = req.query;
    let searchQuery = {};
    if (!query) {
      searchQuery = {
        country_iso_code: country_code,
      };
    } else {
      searchQuery = {
        $and: [
          { $text: { $search: query } },
          { country_iso_code: country_code },
        ],
      };
    }

    // Apply pagination
    const locations = await Location.find(searchQuery)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      results: locations,
      currentPage: page,
      totalResults: locations.length,
    });
  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

function extractDomainUrlTitle(input, filterDomain) {
  const results = [];
  const stack = [input];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        stack.push(current[i]);
      }
    } else if (current && typeof current == "object") {
      if (
        "domain" in current ||
        "url" in current ||
        "title" in current
        // "app_id" in current
      ) {
        // if (filterDomain) {
        if (normalizeDomain(current?.domain) === filterDomain) {
          if (
            input.type === "organic" ||
            input.type === "paid" ||
            input.type === "local_pack" ||
            input.type === "google_play_search_organic"
          ) {
            results.push({
              rank_group: Object.prototype.hasOwnProperty.call(
                current,
                "rank_group"
              )
                ? current.rank_group
                : null,

              rank_group: Object.prototype.hasOwnProperty.call(
                current,
                "rank_group"
              )
                ? current.rank_group
                : null,

              type: Object.prototype.hasOwnProperty.call(current, "type")
                ? current.type
                : null,

              url: Object.prototype.hasOwnProperty.call(current, "url")
                ? current.url
                : null,
              title: Object.prototype.hasOwnProperty.call(current, "title")
                ? current.title
                : null,
            });
          } else {
            results.push({
              type: Object.prototype.hasOwnProperty.call(current, "type")
                ? current.type
                : null,

              url: Object.prototype.hasOwnProperty.call(current, "url")
                ? current.url
                : null,
              title: Object.prototype.hasOwnProperty.call(current, "title")
                ? current.title
                : null,
            });
          }
        }
      }
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          const value = current[key];
          if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    }
  }
  return results;
}

function extractDomainUrlTitleBing(input, filterDomain) {
  const results = [];
  const stack = [input];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        stack.push(current[i]);
      }
    } else if (current && typeof current == "object") {
      if ("domain" in current || "url" in current || "title" in current) {

        if (normalizeDomain(current?.domain) === filterDomain) {
          if (
            input.type === "organic" ||
            input.type === "paid" ||
            input.type === "local_pack" ||
            input.type === "google_play_search_organic"
          ) {
            results.push({
              rank_group: Object.prototype.hasOwnProperty.call(
                current,
                "rank_group"
              )
                ? current.rank_group
                : null,

              rank_group: Object.prototype.hasOwnProperty.call(
                current,
                "rank_group"
              )
                ? current.rank_group
                : null,

              type: Object.prototype.hasOwnProperty.call(current, "type")
                ? current.type
                : null,

              url: Object.prototype.hasOwnProperty.call(current, "url")
                ? current.url
                : null,
              title: Object.prototype.hasOwnProperty.call(current, "title")
                ? current.title
                : null,
            });
          } else {
            results.push({
              type: Object.prototype.hasOwnProperty.call(current, "type")
                ? current.type
                : null,

              url: Object.prototype.hasOwnProperty.call(current, "url")
                ? current.url
                : null,
              title: Object.prototype.hasOwnProperty.call(current, "title")
                ? current.title
                : null,
            });
          }
        }
      }
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          const value = current[key];
          if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    }
  }
  return results;
}

function extractLocalDomain(input, filterDomain) {
  const results = [];
  const stack = [input];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        stack.push(current[i]);
      }
    } else if (current && typeof current == "object") {
      if ("domain" in current || "url" in current || "title" in current) {
        if (normalizeDomain(current?.domain) === filterDomain) {
          results.push({
            rank_group: Object.prototype.hasOwnProperty.call(
              current,
              "rank_group"
            )
              ? current.rank_group
              : null,

            rank_group: Object.prototype.hasOwnProperty.call(
              current,
              "rank_group"
            )
              ? current.rank_group
              : null,

            type: Object.prototype.hasOwnProperty.call(current, "type")
              ? current.type
              : null,

            url: Object.prototype.hasOwnProperty.call(current, "url")
              ? current.url
              : null,

            title: Object.prototype.hasOwnProperty.call(current, "title")
              ? current.title
              : null,

            description: Object.prototype.hasOwnProperty.call(
              current,
              "description"
            )
              ? current.description
              : null,

            rating: Object.prototype.hasOwnProperty.call(current, "rating")
              ? current.rating
              : null,

            position: Object.prototype.hasOwnProperty.call(current, "position")
              ? current.position
              : null,

            phone: Object.prototype.hasOwnProperty.call(current, "phone")
              ? current.phone
              : null,

            is_paid: Object.prototype.hasOwnProperty.call(current, "is_paid")
              ? current.is_paid
              : null,

            cid: Object.prototype.hasOwnProperty.call(current, "cid")
              ? current.cid
              : null,
          });
        }
      }
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          const value = current[key];
          if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    }
  }
  return results;
}

// router.get("/notify", async (req, res) => {
//   try {
//     const task_id = req.query.id;

//     const task = await Task.findOne({ task_id: task_id, status: "Pending" });
//     const projectDetails = await Project.findOne({ _id: task.project_id });
//     const taskResponse = await axios({
//       method: "get",
//       url: `https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${task_id}`,
//       auth: {
//         username: process.env.API_USERNAME,
//         password: process.env.API_PASSWORD,
//       },
//     });

//     const results = taskResponse.data.tasks[0]?.result || [];

//     if (!results.length) {
//       console.log(`🚫 No results available for Task: ${task.task_id}`);
//     }

//     if (!projectDetails) {
//       console.log(`⚠️ Project not found for Task: ${task.task_id}`);
//     }

// let filteredData = results[0].items
//   .map((item) => extractDomainUrlTitle(item, projectDetails.project_url))
//   .flat()
//   .filter((item) => item);

//     let raw_results = results[0];

//     if (!filteredData) {
//       console.log(`🚫 No matching results for Task: ${task.task_id}`);
//     }

//     await Task.updateOne(
//       { task_id: task.task_id },
//       {
//         $set: {
//           status: "Completed",
//           results: filteredData,
//           raw_results: raw_results,
//         },
//       }
//     );
//     console.log("all task updated successfully");
//   } catch (taskError) {
//     console.error(`Error fetching results:`, taskError.message);
//   }
// });


router.get("/notify", async (req, res) => {
  try {
    const task_id = req.query.id;
    console.log(task_id, "task_id")
    if (!task_id) return res.status(400).json({ message: "Missing task ID" });
    res.status(200).json({ message: "Pingback received", task_id });
    await notifyQueue.add("processPingback", { task_id });
  }
  catch (err) {
    console.error("❌ Notify route error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/notify1", async (req, res) => {
  try {
    const task_id = req.query.id;

    console.log("all task updated successfully");
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});


router.get("/ai_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    const task = await Task.findOne({
      task_id: task_id,
      // task_type: "aiMode",
      task_type: "llm_aiMode",
      status: "Pending",
    });

    const projectDetails = await AIMode.findOne({
      _id: task.project_id,
    });

    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    // let filteredData = results[0].items
    //   .map((item) => extractDomainUrlTitle(item, projectDetails.target))
    //   .flat()
    //   .filter((item) => item);

    let raw_results = results[0];

    // if (!filteredData) {
    //   console.log(`🚫 No matching results for Task: ${task.task_id}`);
    // }

    await Task.updateOne(
      { task_id: task.task_id },
      {
        $set: {
          status: "Completed",
          results: [],
          // raw_results: raw_results,
          results: raw_results,
        },
      }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});

router.get("/llm_chatgpt_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    const task = await Task.findOne({
      task_id: task_id,
      task_type: "llm_chatgpt",
      status: "Pending",
    });

    const projectDetails = await LLM.findOne({
      _id: task.project_id,
      type: "chatgpt",
    });

    const taskResponse = await axios({
      method: "get",
      // url: `https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_responses/task_get/${task_id}`,
      url: `https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    // let filteredData = results[0].items
    //   .map((item) => extractDomainUrlTitle(item, projectDetails.target))
    //   .flat()
    //   .filter((item) => item);

    // if (!filteredData) {
    //   console.log(`🚫 No matching results for Task: ${task.task_id}`);
    // }

    await Task.updateOne(
      { task_id: task.task_id },
      {
        $set: {
          status: "Completed",
          results: results[0],
          raw_results: [],
        },
      }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});

router.get("/app_rank_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    const task = await Task.findOne({
      task_id: task_id,
      status: "Pending",
    });

    const projectDetails = await AppRanking.findOne({ _id: task.project_id });

    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/app_data/google/app_searches/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    let filteredData = results[0].items
      .map((item) => extractDomainUrlTitle(item, projectDetails.target))
      .flat()
      .filter((item) => item);

    let raw_results = results[0];

    if (!filteredData) {
      console.log(`🚫 No matching results for Task: ${task.task_id}`);
    }

    await Task.updateOne(
      { task_id: task.task_id },
      {
        $set: {
          status: "Completed",
          results: filteredData,
          raw_results: raw_results,
        },
      }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError);
  }
});

router.get("/apple_rank_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    const task = await Task.findOne({
      task_id: task_id,
      status: "Pending",
    });
    const projectDetails = await AppRanking.findOne({ _id: task.project_id });

    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/app_data/apple/app_searches/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    let filteredData = results[0].items
      .map((item) => extractDomainUrlTitle(item, projectDetails.target))
      .flat()
      .filter((item) => item);

    let raw_results = results[0];

    if (!filteredData) {
      console.log(`🚫 No matching results for Task: ${task.task_id}`);
    }

    await Task.updateOne(
      { task_id: task.task_id },
      {
        $set: {
          status: "Completed",
          results: filteredData,
          raw_results: raw_results,
        },
      }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError);
  }
});

router.get("/local_notify", async (req, res) => {
  try {
    const task_id = req.query.id;
    const task = await LocalTask.findOne({
      task_id: task_id,
      status: "Pending",
    });
    const projectDetails = await LocalProject.findOne({ _id: task.project_id });
    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/serp/google/local_finder/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    let filteredData = results[0];
    // ?.items
    //   .map((item) => extractLocalDomain(item, projectDetails.project_url))
    //   .flat()
    //   .filter((item) => item);

    if (!filteredData) {
      console.log(`🚫 No matching results for Task: ${task.task_id}`);
    }

    await LocalTask.updateOne(
      { task_id: task.task_id },
      { $set: { status: "Completed", results: filteredData } }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});

// router.get("/bing_notify", async (req, res) => {
//   try {
//     const task_id = req.query.id;
//     const task = await BingTask.findOne({
//       task_id: task_id,
//       status: "Pending",
//     });
//     const projectDetails = await AllRankKeyword.findOne({
//       _id: task.project_id,
//     });
//     const taskResponse = await axios({
//       method: "get",
//       url: `https://api.dataforseo.com/v3/serp/bing/organic/task_get/advanced/${task_id}`,
//       auth: {
//         username: process.env.API_USERNAME,
//         password: process.env.API_PASSWORD,
//       },
//     });

//     const results = taskResponse.data.tasks[0]?.result || [];

//     if (!results.length) {
//       console.log(`🚫 No results available for Task: ${task.task_id}`);
//     }

//     if (!projectDetails) {
//       console.log(`⚠️ Project not found for Task: ${task.task_id}`);
//     }

//     let filteredData = results[0]?.items
//       .map((item) => extractDomainUrlTitle(item, projectDetails.project_url))
//       .flat()
//       .filter((item) => item);

//     if (!filteredData) {
//       console.log(`🚫 No matching results for Task: ${task.task_id}`);
//     }

//     await BingTask.updateOne(
//       { task_id: task.task_id },
//       { $set: { status: "Completed", results: filteredData } }
//     );
//   } catch (taskError) {
//     console.error(`Error fetching results:`, taskError.message);
//   }
// });

router.get("/bing_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    const task = await Task.findOne({
      task_id: task_id,
      status: "Pending",
      task_type: "bing",
    });

    const projectDetails = await Bing.findOne({
      _id: task.project_id,
    });

    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/serp/bing/organic/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    let raw_results = results[0];

    let filteredData = results[0]?.items
      .map((item) => extractDomainUrlTitleBing(item, projectDetails.target))
      .flat()
      .filter((item) => item);

    if (!filteredData) {
      console.log(`🚫 No matching results for Task: ${task.task_id}`);
    }

    await Task.updateOne(
      { task_id: task.task_id },
      {
        $set: {
          status: "Completed",
          results: filteredData,
          raw_results: raw_results,
        },
      }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});

router.get("/youtube_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    const task = await Task.findOne({
      task_id: task_id,
      status: "Pending",
      task_type: "youtube",
    });

    console.log(task, "task")

    const projectDetails = await Youtube.findOne({
      _id: task.project_id,
    });
    console.log(projectDetails, "projectDetails")

    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/serp/youtube/organic/task_get/advanced/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    const results = taskResponse.data.tasks[0]?.result || [];

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    if (!projectDetails) {
      console.log(`⚠️ Project not found for Task: ${task.task_id}`);
    }

    let raw_results = results[0];

    // let filteredData = results[0]?.items
    //   .map((item) => extractDomainUrlTitleBing(item, projectDetails.target))
    //   .flat()
    //   .filter((item) => item);

    // if (!filteredData) {
    //   console.log(`🚫 No matching results for Task: ${task.task_id}`);
    // }

    await Task.updateOne(
      { task_id: task.task_id },
      {
        $set: {
          status: "Completed",
          results: [],
          raw_results: raw_results,
        },
      }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});

// more than 1000 keywords api call

router.get("/search_volume_notify", async (req, res) => {
  try {
    const task_id = req.query.id;

    console.log(task_id, "task_id")

    const task = await SearchVolume.findOne({
      task_id: task_id,
      status: "Pending",
    });

    console.log(task, "task")

    const taskResponse = await axios({
      method: "get",
      url: `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/task_get/${task_id}`,
      auth: {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD,
      },
    });

    console.log(taskResponse, "taskResponse")

    const results = taskResponse.data.tasks[0]?.result || [];

    console.log(results, "results")

    if (!results.length) {
      console.log(`🚫 No results available for Task: ${task.task_id}`);
    }

    await SearchVolume.updateOne(
      { task_id: task.task_id },
      { $set: { status: "Completed", results: results } }
    );
  } catch (taskError) {
    console.error(`Error fetching results:`, taskError.message);
  }
});

router.get("/read_excel", async (req, res) => {
  try {console.log("this is called")
    const { project_id, brand, category, subCategory } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: "project_id is required" });
    }

    const data = await readExcelFile(project_id);

    // Apply ONLY excel-level filters
    const filtered = data.filter(row => {
      if (brand && row.Brand !== brand) return false;
      if (category && row.Category !== category) return false;
      if (subCategory && row.subCategory !== subCategory) return false;
      return true;
    });

    const brandSet = new Set();
    const categorySet = new Set();
    const subCategorySet = new Set();

    filtered.forEach(row => {
      if (row.Brand) brandSet.add(row.Brand);
      if (row.Category) categorySet.add(row.Category);
      if (row.SubCategory) subCategorySet.add(row.SubCategory);
    });

    res.json({
      metadata: {
        brands: [...brandSet],
        categories: [...categorySet],
        subCategories: [...subCategorySet],
      },
    });
  } catch (error) {
    console.error("❌ Error in read_excel API:", error);
    res.status(500).json({ error: "Failed to read excel metadata" });
  }
});

router.get("/read_local_excel", async (req, res) => {
  try {
    const project_id = req.query.project_id;
    const filter = JSON.parse(req.query.filter);
    const data = await readLocalExcelFile(project_id);

    const filterData = data.filter((item) => {
      return (
        (filter.brand === "" || item.Brand === filter.brand) &&
        (filter.category === "" || item.Category === filter.category) &&
        (filter.subCategory === "" || item.SubCategory === filter.subCategory)
      );
    });
    const metadata = {
      brands: [...new Set(data.map((item) => item.Brand))],
      categories: [...new Set(data.map((item) => item.Category))],
      subCategories: [...new Set(data.map((item) => item.SubCategory))],
    };
    res.json({ source: "api", tasks: filterData, metadata: metadata });
  } catch (error) {
    console.error("❌ Error in read_excel API:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// router.get("/read_bing_excel", async (req, res) => {
//   try {
//     const project_id = req.query.project_id;
//     const filter = JSON.parse(req.query.filter);
//     const data = await readBingExcelFile(project_id);

//     const filterData = data.filter((item) => {
//       return (
//         (filter.brand === "" || item.Brand === filter.brand) &&
//         (filter.category === "" || item.Category === filter.category) &&
//         (filter.subCategory === "" || item.SubCategory === filter.subCategory)
//       );
//     });
//     const metadata = {
//       brands: [...new Set(data.map((item) => item.Brand))],
//       categories: [...new Set(data.map((item) => item.Category))],
//       subCategories: [...new Set(data.map((item) => item.SubCategory))],
//     };
//     res.json({ source: "api", tasks: filterData, metadata: metadata });
//   } catch (error) {
//     console.error("❌ Error in read_bing_excel API:", error.message);
//     res.status(500).json({ error: error.message });
//   }
// });


// router.post("/postback/notify", async (req, res) => {
//   if (!req.body || !req.body.tasks?.length) {
//     return res.status(400).send("empty POST");
//   }
//   res.status(200).send("ok"); // respond immediately

//   try {
//     await PostbackNotifyQueue.add("PostbackNotifyQueue", {
//       payload: req.body,
//     });
//     console.log("payload added in the queue....")
//   } catch (err) {
//     console.error("Postback enqueue failed:", err);
//   }
// });

router.get("/read_bing_excel", async (req, res) => {
  try {
    const { project_id, brand, category, subCategory } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: "project_id is required" });
    }

    const data = await readBingExcelFile(project_id);

    // Apply ONLY excel-level filters
    const filtered = data.filter(row => {
      if (brand && row.Brand !== brand) return false;
      if (category && row.Category !== category) return false;
      if (subCategory && row.subCategory !== subCategory) return false;
      return true;
    });

    const brandSet = new Set();
    const categorySet = new Set();
    const subCategorySet = new Set();

    filtered.forEach(row => {
      if (row.Brand) brandSet.add(row.Brand);
      if (row.Category) categorySet.add(row.Category);
      if (row.SubCategory) subCategorySet.add(row.SubCategory);
    });

    res.json({
      metadata: {
        brands: [...brandSet],
        categories: [...categorySet],
        subCategories: [...subCategorySet],
      },
    });
  } catch (error) {
    console.error("❌ Error in read_excel API:", error);
    res.status(500).json({ error: "Failed to read excel metadata" });
  }
});



function startTimer() {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1e6; // ms
}

function logStep(jobId, label, ms) {
  console.log(`⏱️ [Job ${jobId}] ${label}: ${ms.toFixed(2)} ms`);
}


router.post("/postback/notify", async (req, res) => {
  const tApi = startTimer();
  const project_id = req.query.project_id;
  const project_url = req.query.project_url;

  if (!req.body || !req.body.tasks?.length) {
    return res.status(400).send("empty POST");
  }

  res.status(200).send("ok"); // respond immediately

  try {
    const tEnqueue = startTimer();

    await PostbackNotifyQueue.add("PostbackNotifyQueue", {
      payload: req.body,
      project_id: project_id,
      project_url: project_url
    });

    console.log(
      `⏱️ Postback enqueue: ${tEnqueue().toFixed(2)} ms`
    );
    console.log(
      `⏱️ API handler total: ${tApi().toFixed(2)} ms`
    );
  } catch (err) {
    console.error("Postback enqueue failed:", err);
  }
});



module.exports = router;
// module.exports = extractDomainUrlTitle;
