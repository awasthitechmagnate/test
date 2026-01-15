import axios from "axios";

export const API_BASE_URL = "http://localhost:5000";
// export const API_BASE_URL = "http://15.206.172.167";
// const API_BASE_URL = "https://rank-tracker.techmagnate.com";

// export const API_BASE_URL = "http://13.233.109.21";
// --------------------------------------------
// export const API_BASE_URL = "http://rank.techmagnate.in";

// very new api
// export const API_BASE_URL = "http://13.202.201.123";
// export const API_BASE_URL = "http://rank.techmagnate.in";
// -----------------------------------
const getToken = () => {
  return localStorage.getItem("token");
};

const getInternalToken = () => {
  return localStorage.getItem("internaltoken");
};

export const createTask = async (taskData) => {
  return await axios.post(`${API_BASE_URL}/api/tasks/create`, taskData);
};

// project routes

export const createProject = async (projectData) => {
  return await axios.post(`${API_BASE_URL}/api/projects/create`, projectData);
};

export const getProjects = (filter) => {
  const token = getToken();

  let queryParams = new URLSearchParams();

  if (filter && Object.keys(filter).length > 0) {
    queryParams.append("filters", JSON.stringify(filter));
  }

  return axios.get(
    `${API_BASE_URL}/api/projects/get?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const blockProject = async (projectId) => {
  return await axios.post(
    `${API_BASE_URL}/api/projects/block-project/${projectId}`
  );
};

// local project routes

export const createLocalProject = async (projectData) => {
  return await axios.post(
    `${API_BASE_URL}/api/local-projects/create`,
    projectData
  );
};

export const getLocalProjects = (filter) => {
  const token = getToken();

  let queryParams = new URLSearchParams();

  if (filter && Object.keys(filter).length > 0) {
    queryParams.append("filters", JSON.stringify(filter));
  }

  return axios.get(
    `${API_BASE_URL}/api/local-projects/get?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const blockLocalProject = async (projectId) => {
  return await axios.post(
    `${API_BASE_URL}/api/local-projects/block-local-project/${projectId}`
  );
};

// upload keywords

export const UploadKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/upload/upload-file`, data);

export const UploadLocalKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/local-upload/upload-file`, data);

export const UploadTargets = (data) =>
  axios.post(`${API_BASE_URL}/api/upload-target/upload-file`, data);

export const UploadAllRankKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/upload-allRank-keywords/upload-file`, data);

export const UploadAIModeKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/upload-ai-mode-keywords/upload-file`, data);

export const UploadLLMModeKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/upload-llm-keywords/upload-file`, data);

export const UploadAppRankKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/upload-app-rank-keywords/upload-file`, data);

export const UploadBingRankKeywords = (data) =>
  axios.post(`${API_BASE_URL}/api/upload-bing-rank-keywords/upload-file`, data);

export const UploadYoutubeRankKeywords = (data) =>
  axios.post(
    `${API_BASE_URL}/api/upload-youtube-rank-keywords/upload-file`,
    data
  );

//Unified dashboard
// Accepts an object: { page, limit, filter } and optional axios config as 2nd arg
export const getUnifiedRankingDashboard = async (
  { page, limit, filter = {} } = {},
  axiosConfig = {}
) => {
  let filterObj = {};
  if (!filter) filterObj = {};
  else if (typeof filter === "string") {
    try { filterObj = JSON.parse(filter); } catch (e) { filterObj = {}; }
  } else {
    filterObj = filter;
  }

  const filterStr =
    filterObj && Object.keys(filterObj).length
      ? encodeURIComponent(JSON.stringify(filterObj))
      : "";

  const params = [];
  if (page != null && page !== "") {
    params.push(`page=${encodeURIComponent(page)}`);
  }
  if (limit != null && limit !== "") {
    params.push(`limit=${encodeURIComponent(limit)}`);
  }
  if (filterStr) {
    params.push(`filter=${filterStr}`);
  }

  const qs = params.length ? `?${params.join("&")}` : "";

  return axios.get(
    `${API_BASE_URL}/api/tasks/get-unified-ranking-dashboard${qs}`,
    axiosConfig
  );
};



//get local ranking
export const getLocalRanking = async (page = 1, limit = 10, filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/local-rankings/ranking?page=${page}&limit=${limit}&filter=${filter}`
  );
};

export const exportLocalRanking = async (filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/local-rankings/export-excel?filter=${filter}`,
    { responseType: "blob" } // important for binary files
  );
};

export const getAllTasks = async (page = 1, limit = 10, filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get?page=${page}&limit=${limit}&filter=${filter}`
  );
};

export const getAllTaskNew = async (page = 1, limit = 10, filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-rank-difference?page=${page}&limit=${limit}&filter=${filter}`
  );
};

export const getAllRanks = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-rank-groups?&filter=${filter}`
  );
};


export const getAllRanksByCategory = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-ranks-by-category?&filter=${filter}`
  );
};

export const getRankTracking = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/rank-tracker/get-entered-rank-tracking?&filter=${filter}`
  );
};

export const getExitRankTracking = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/rank-tracker/get-exit-rank-tracking?&filter=${filter}`
  );
};

// featured snippet api

export const getFeaturedSnippet = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-featured-snippet?&filter=${filter}`
  );
};

export const getSerpFeatureDetails = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-serp-features-details?&filter=${filter}`
  );
};

// app features api

export const getAppFeatures = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-app-features?&filter=${filter}`
  );
};

// paa 

export const getPeopleAlsoAsk = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-ppa?&filter=${filter}`
  );
};



export const getPeopleAlsoAskMetrics = ({ project_id, page = 1, limit = 50 }) => {
  return axios.get(`${API_BASE_URL}/api/tasks/get-ppa-metrics`, {
    params: {
      project_id,
      page,
      limit,
    },
  });
};

export const getPeopleAlsoAskMetricsSummary = ({ project_id, page = 1, limit = 50 }) => {
  return axios.get(`${API_BASE_URL}/api/tasks/get-ppa-metrics-summary`, {
    params: {
      project_id,
      page,
      limit,
    },
  });
};


//AI Overview

export const getAIOverview = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-ai_overview?&filter=${filter}`
  );
};

// Images

export const getImages = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-images?&filter=${filter}`
  );
};

// Local Pack

export const getLocalPack = async (filterQuery) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/tasks/get-local-pack?&filter=${filter}`
  );
};


export const getTaskResults = (taskId) =>
  axios.get(`${API_BASE_URL}/api/tasks/results/${taskId}`);

export const getLanguageCodes = () =>
  axios.get(`${API_BASE_URL}/api/utils/get_language`);

export const getCountries = () =>
  axios.get(`${API_BASE_URL}/api/utils/get_countries`);

export const getLocations = async (searchQuery, countryCode) => {
  return await axios.get(
    `${API_BASE_URL}/api/utils/search_location?query=${searchQuery}&country_code=${countryCode}`
  );
};

// Auth api

export const register = (data) =>
  axios.post(`${API_BASE_URL}/api/auth/register`, data);

export const userLogin = (data) =>
  axios.post(`${API_BASE_URL}/api/auth/login`, data);

export const changePassword = (data, pathType) => {
  let query = { ...data, pathType };
  axios.post(`${API_BASE_URL}/api/auth/change-password`, query);
};

export const getProfile = () => {
  const token = getToken();
  return axios.get(`${API_BASE_URL}/api/auth/get-profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

// export const getExcel = async (project_id, filter) => {
//   filter = JSON.stringify(filter);
//   return axios.get(
//     `${API_BASE_URL}/api/utils/read_excel?project_id=${project_id}&filter=${filter}`
//   );
// };
// ---------------this code for keyword Ranking perfect code-------------------------------------------------------------------------
export const getExcel = async (project_id, params = {}) => {
  const query = new URLSearchParams({
    project_id,
    ...params,
  }).toString();

  return axios.get(
    `${API_BASE_URL}/api/utils/read_excel?project_id=${project_id}&query=${query}`
  );
};

export const getLocalExcel = async (project_id, filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/utils/read_local_excel?project_id=${project_id}&filter=${filter}`
  );
};

export const getBingExcel = async (project_id, filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/utils/read_bing_excel?project_id=${project_id}&filter=${filter}`
  );
};

// export api

export const exportRankingDifferenceCsv = async (filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/export/rankingDifference-csv?filter=${filter}`
  );
};

export const exportRankingDifferencePdf = async (filter) => {
  filter = JSON.stringify(filter);
  return axios
    .get(`${API_BASE_URL}/api/export/rankingDifference-pdf?filter=${filter}`, {
      responseType: "blob",
    })
    .then((res) => res.data);
};

export const exportKeywordRankingCsv = async (filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/export/keywordRanking-csv?filter=${filter}`
  );
};

export const exportUrlRankingCsv = async (filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/export/urlRanking-csv?filter=${filter}`
  );
};

export const exportRawKeywordRankingCsv = async (filter) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/export/keywordRanking-raw-csv?filter=${filter}`
  );
};

// Dashboard api

export const dashboardCount = async (project_id) => {
  return axios.get(
    `${API_BASE_URL}/api/dashboard/get-count?project_id=${project_id}`
  );
};

// user api

export const getAllUsers = () => {
  const token = getToken();
  return axios.get(`${API_BASE_URL}/api/users/get-all-users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getUsers = async (filter) => {
  let queryParams = new URLSearchParams();

  if (filter && Object.keys(filter).length > 0) {
    queryParams.append("filters", JSON.stringify(filter));
  }
  return axios.get(
    `${API_BASE_URL}/api/users/get-users?${queryParams.toString()}`
  );
};

export const addUser = async (data) => {
  return axios.post(`${API_BASE_URL}/api/users/add-user`, data);
};

export const editUser = async (_id, data) => {
  return axios.put(`${API_BASE_URL}/api/users/edit-user/${_id}`, data);
};

export const deleteUser = async (_id) => {
  return axios.delete(`${API_BASE_URL}/api/users/delete-user/${_id}`);
};

export const blockUser = async (_id) => {
  return axios.put(`${API_BASE_URL}/api/users/block-user/${_id}`);
};

// Traffic Analysis

export const createTrafficReport = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/traffic/create-traffic?filter=${filter}`
  );
};

export const getTrafficReport = async (page = 1, limit = 10, filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/traffic/get-traffic?page=${page}&limit=${limit}&filter=${filter}`
  );
};

export const exportTrafficReport = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/traffic/export-traffic?filter=${filter}`
  );
};

export const getTarget = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(`${API_BASE_URL}/api/traffic/get-target?filter=${filter}`);
};

export const deleteTrafficProject = async (id) => {
  return axios.get(`${API_BASE_URL}/api/traffic/delete-project/${id}`);
};

// All Rank Analysis

export const createAllRankReport = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/all-rank/create-all-rank?filter=${filter}`
  );
};

export const runAllRank = async (project_id) => {
  return axios.get(`${API_BASE_URL}/api/all-rank/run/${project_id}`);
};

export const getAllRankReport = async (page = 1, limit = 10, filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/all-rank/get-report?page=${page}&limit=${limit}&filter=${filter}`
  );
};

export const exportAllRankExcel = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/all-rank/export-excel?filter=${filter}`,
    {
      responseType: "arraybuffer",
    }
  );
};

export const exportAllRankPdf = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.post(
    `${API_BASE_URL}/api/all-rank/export-pdf?filter=${filter}`,
    {
      responseType: "blob",
    }
  );
};

export const getAllRankKeywords = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/all-rank/get-all-rank-keywords?filter=${filter}`
  );
};

export const deleteAllRankProject = async (id) => {
  return axios.get(`${API_BASE_URL}/api/all-rank/delete-project/${id}`);
};

// AI Mode

export const getAIModeKeywords = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(`${API_BASE_URL}/api/ai-mode/get-projects?filter=${filter}`);
};

export const getAIModeProjects = async (filter) => {
  let url = `${API_BASE_URL}/api/ai-mode/get-projects`;
  if (filter) {
    url += `?filter=${encodeURIComponent(JSON.stringify(filter))}`;
  }
  return axios.get(url);
};

export const editAIProjects = async (id, payload) => {
  const url = `${API_BASE_URL}/api/ai-mode/edit-project/${id}`;
  return axios.put(url, payload);
};

export const deleteAIProjects = async (id) => {
  const url = `${API_BASE_URL}/api/ai-mode/delete-project/${id}`;
  return axios.delete(url);
};


export const createAIModeReport = async (filterQuery) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/ai-mode/create-ai-mode?filter=${filter}`
  );
};

export const getAIModeRanks = async (filterQuery) => {
  const filters = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(`${API_BASE_URL}/api/ai-mode/get?filters=${filters}`);
};

export const exportAIModeCsv = async (filter) => {
  const response = await axios.get(`${API_BASE_URL}/api/ai-mode/export-csv`, {
    params: {
      filter: JSON.stringify(filter),
    },
    responseType: "blob",
  });
  return response.data;
};

export const exportExcel = async (filter) => {
  const response = await axios.get(`${API_BASE_URL}/api/ai-mode/get-excel`, {
    params: { filter: JSON.stringify(filter) },
    responseType: "blob", // <-- ensures backend sends a Blob
  });
  return response.data; // <-- this is the Blob
};

export const getDailyRankingAIReport = async (
  page = 1,
  limit = 10,
  filterQuery
) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/ai-mode/daily-report?page=${page}&limit=${limit}&filter=${filter}`
  );
};

// LLM Rankings

// export const getLLMProjects = async (filter = {}, userId, userRole) => {
//   const params = new URLSearchParams();

//   if (filter.name) params.append("name", filter.name);
//   if (filter.startDate) params.append("startDate", filter.startDate);
//   if (filter.endDate) params.append("endDate", filter.endDate);

//   const url = `${API_BASE_URL}/api/llm/get-projects?${params.toString()}&userId=${userId}&userRole=${userRole}`;
//   return axios.get(url);
// };

export const getLLMProjects = async (filter = {}) => {
  const token = getToken()
  const params = new URLSearchParams();

  if (filter.name) params.append("name", filter.name);
  if (filter.startDate) params.append("startDate", filter.startDate);
  if (filter.endDate) params.append("endDate", filter.endDate);

  const url = `${API_BASE_URL}/api/llm/get-projects?${params.toString()}`;

  return axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
// --------------------------------------------------------------------rank edit  by awasthi--------
export const editRankProjects = async (id, payload) => {
  const url = `${API_BASE_URL}/api/projects/edit-project/${id}`;
  return axios.put(url, payload);
};

//-------------------------------local rank by awasthi------------------

export const editLocalRankProjects = async (id, payload) => {
  const url = `${API_BASE_URL}/api/local-projects/edit-project/${id}`;
  return axios.put(url, payload);
};



export const editLLMProjects = async (id, payload) => {
  const url = `${API_BASE_URL}/api/llm/edit-project/${id}`;
  return axios.put(url, payload);
};

export const deleteLLMProjects = async (id) => {
  const url = `${API_BASE_URL}/api/llm/delete-project/${id}`;
  return axios.delete(url);
};

export const getLLMRanks = async (page, limit, filterQuery, slug) => {
  const filters = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(`${API_BASE_URL}/api/llm/get/${slug}?filters=${filters}`);
};

export const getCompetitorRanks = async (page, limit, filterQuery, slug) => {
  const filters = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(`${API_BASE_URL}/api/llm/get-competitor/${slug}?filters=${filters}`);
};

export const getCitations = async (filterQuery) => {
  const filters = filterQuery ? encodeURIComponent(JSON.stringify(filterQuery)) : "";
  return axios.get(`${API_BASE_URL}/api/llm/getCitationsAndRanks?filters=${filters}`);
};

// export const getLLMPromptsWithUrls = async (filterQuery) => {
//   const filters = filterQuery ? encodeURIComponent(JSON.stringify(filterQuery)) : "";
//   return axios.get(`${API_BASE_URL}/api/llm/getPromptsWithUrls?filters=${filters}`);
// };

export const getLLMPromptsWithUrls = async ({ filters = {}, page = 1, limit = 10 }) => {
  const filtersString = encodeURIComponent(JSON.stringify(filters));
  return axios.get(
    `${API_BASE_URL}/api/llm/getPromptsWithUrls?filters=${filtersString}&page=${page}&limit=${limit}`
  );
};

export const getLLMPromptsWithBrand = async ({ filters = {}, page = 1, limit = 10 }) => {
  const filtersString = encodeURIComponent(JSON.stringify(filters));
  return axios.get(
    `${API_BASE_URL}/api/llm/getPromptsWithBrand?filters=${filtersString}&page=${page}&limit=${limit}`
  );
};

export const getLLMThirdPartyPages = async ({ filters = {}, page = 1, limit = 10 }) => {
  const filtersString = encodeURIComponent(JSON.stringify(filters));
  return axios.get(
    `${API_BASE_URL}/api/llm/getThirdPartyPages?filters=${filtersString}&page=${page}&limit=${limit}`
  );
};

export const downloadExcelgetLLMPromptsWithUrls = async (filters = {}) => {
  const filtersString = encodeURIComponent(JSON.stringify(filters));
  return axios.get(`${API_BASE_URL}/api/llm/getPromptsWithUrls?filters=${filtersString}`);
};


export const downloadExcel = async (filterQuery) => {
  const filters = filterQuery ? encodeURIComponent(JSON.stringify(filterQuery)) : "";

  return axios.get(`${API_BASE_URL}/api/llm/getExcel?filters=${filters}`, {
    responseType: "arraybuffer", // important for Excel files
  });
};

export const getMyPagesCount = async ({ filterQuery = {} }) => {
  const filtersString = encodeURIComponent(JSON.stringify(filterQuery));
  return axios.get(`${API_BASE_URL}/api/llm/getMyPages?filters=${filtersString}`);
};

export const getMyPagesCount1 = async (filterQuery) => {
  const { selectedProject, selectedDate, startDate, endDate } = filterQuery;

  // Build query parameters
  const params = new URLSearchParams();
  if (selectedDate) params.append('selectedDate', selectedDate);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/api/llm/getMyPages1/${selectedProject}${queryString ? `?${queryString}` : ''}`;

  return axios.get(url);
};

export const getLLMPrompts = async ({ filters = {}, page = 1, limit = 10 }) => {
  const filtersString = encodeURIComponent(JSON.stringify(filters));
  return axios.get(
    `${API_BASE_URL}/api/llm/getPrompts?filters=${filtersString}&page=${page}&limit=${limit}`
  );
};

// Bing Mode

// export const getBingProjects = async (filter) => {
//   let url = `${API_BASE_URL}/api/bing/get-projects`;
//   if (filter) {
//     url += `?filter=${encodeURIComponent(JSON.stringify(filter))}`;
//   }
//   return axios.get(url);
// };


// export const getDailyRankingBingReport = async (
//   page = 1,
//   limit = 10,
//   filterQuery
// ) => {
//   const filter = filterQuery ? JSON.stringify(filterQuery) : "";
//   return axios.get(
//     `${API_BASE_URL}/api/bing/daily-report?page=${page}&limit=${limit}&filter=${filter}`
//   );
// };

// export const exportBingRankings = async (filter) => {
//   filter = JSON.stringify(filter);
//   return axios.get(
//     `${API_BASE_URL}/api/bing/export-excel?filter=${filter}`,
//     { responseType: "arraybuffer" },
//   );
// };

// export const editBingProjects = async (id, payload) => {
//   const url = `${API_BASE_URL}/api/bing/edit-project/${id}`;
//   return axios.put(url, payload);
// };

// export const deleteBingProjects = async (id) => {
//   const url = `${API_BASE_URL}/api/bing/delete-project/${id}`;
//   return axios.delete(url);
// };



export const getBingProjects = async (filter) => {
  let url = `${API_BASE_URL}/api/bing/get-projects`;
  if (filter) {
    url += `?filter=${encodeURIComponent(JSON.stringify(filter))}`;
  }
  return axios.get(url);
};

export const getDailyRankingBingReport = async (
  page = 1,
  limit = 10,
  filterQuery
) => {
  let url = `${API_BASE_URL}/api/bing/daily-report?page=${page}&limit=${limit}`;

  if (filterQuery) {
    url += `&filter=${encodeURIComponent(JSON.stringify(filterQuery))}`;
  }

  return axios.get(url);
};

export const exportBingRankings = async (filter) => {
  const encodedFilter = encodeURIComponent(JSON.stringify(filter));

  return axios.get(
    `${API_BASE_URL}/api/bing/export-excel?filter=${encodedFilter}`,
    { responseType: "arraybuffer" }
  );
};

export const editBingProjects = async (id, payload) => {
  return axios.put(
    `${API_BASE_URL}/api/bing/edit-project/${id}`,
    payload
  );
};

export const deleteBingProjects = async (id) => {
  return axios.delete(
    `${API_BASE_URL}/api/bing/delete-project/${id}`
  );
};

// APP Rank

export const getAppRankProjects = async (filterQuery, apiType) => {
  const filter = filterQuery
    ? encodeURIComponent(JSON.stringify(filterQuery))
    : "";
  return axios.get(
    `${API_BASE_URL}/api/app-rank/get-projects/${apiType}?filter=${filter}`
  );
};

export const getDailyAppRankingReport = async (
  page = 1,
  limit = 10,
  filterQuery
) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/app-rank/daily-report?page=${page}&limit=${limit}&filter=${filter}`
  );
};

export const exportLLMRankings = async (filter, slug) => {
  filter = JSON.stringify(filter);
  return axios.get(
    `${API_BASE_URL}/api/llm/export/${slug}?filter=${filter}`,
    { responseType: "blob" }
  );
};


export const editAppRankProjects = async (id, payload) => {
  const url = `${API_BASE_URL}/api/app-rank/edit-project/${id}`;
  return axios.put(url, payload);
};

export const deleteAppRankProjects = async (id) => {
  const url = `${API_BASE_URL}/api/app-rank/delete-project/${id}`;
  return axios.delete(url);
};

// Youtube rankings

export const getYoutubeProjects = async (filter = {}) => {
  const params = new URLSearchParams();

  if (filter.name) params.append("name", filter.name);
  if (filter.startDate) params.append("startDate", filter.startDate);
  if (filter.endDate) params.append("endDate", filter.endDate);

  const url = `${API_BASE_URL}/api/youtube/get-projects?${params.toString()}`;
  return axios.get(url);
};

export const getDailyYoutubeRankingReport = async (
  page = 1,
  limit = 10,
  filterQuery
) => {
  const filter = filterQuery ? JSON.stringify(filterQuery) : "";
  return axios.get(
    `${API_BASE_URL}/api/youtube/daily-report?page=${page}&limit=${limit}&filter=${filter}`
  );
};



export const getYoutubeExcel = async (project_id, params = {}) => {
  const query = new URLSearchParams({
    project_id,
    ...params,
  }).toString();

  return axios.get(
    `${API_BASE_URL}/api/utils/read_excel?project_id=${project_id}&query=${query}`
  );
};




export const editYoutubeProjects = async (id, payload) => {
  const url = `${API_BASE_URL}/api/Youtube/edit-project/${id}`;
  return axios.put(url, payload);
};

export const deleteYoutubeProjects = async (id) => {
  const url = `${API_BASE_URL}/api/Youtube/delete-project/${id}`;
  return axios.delete(url);
};

// Access manager

export const createRoles = async (module) => {
  const token = getToken();
  const response = await axios.post(
    `${API_BASE_URL}/api/access/roles`,
    module,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response;
};

export const fetchModules = () => {
  const token = getToken();
  const response = axios.get(`${API_BASE_URL}/api/access/modules`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response;
};

export const fetchRoles = () => {
  const token = getToken();
  const response = axios.get(`${API_BASE_URL}/api/access/roles`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response;
};

export const deleteRoles = (id) => {
  const token = getToken();
  const response = axios.delete(`${API_BASE_URL}/api/access/roles/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response;
};

export const assignUserModules = async (userId, roleId) => {
  const token = getToken();
  return axios.put(
    `${API_BASE_URL}/api/access/users/${userId}/role`,
    { roleId },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};


/***************Internal Portal API Routes ******************/

export const internalUserLogin = (data) =>
  axios.post(`${API_BASE_URL}/api/auth/internal-login`, data);

export const addInternalUser = async (data) => {
  return axios.post(`${API_BASE_URL}/api/auth/add-internal-user`, data);
};

export const getInternalProfile = (token) => {
  // const token = getInternalToken();
  console.log(token, "token")
  return axios.get(`${API_BASE_URL}/api/auth/get-internal-profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};
