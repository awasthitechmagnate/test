import React, { useContext, useEffect, useState } from "react";
import dayjs from "dayjs";
import moment from "moment";
import {
  exportBingRankings,
  exportKeywordRankingCsv,
  exportUrlRankingCsv,
  getBingExcel,
  getBingProjects,
  getDailyRankingBingReport,
  getExcel,
} from "../../services/api";
import AuthContext from "../../context/AuthContext";
import "../../styles/KeywordsRanking.css";
import { Spinner } from "react-bootstrap";

const BingRankings = () => {
  const [tasks, setTasks] = useState([]);
  const [urlTasks, setUrlTasks] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [activeKey, setActiveKey] = useState("1");
  const [projects, setProjects] = useState([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const [urlExpandedRowKeys, setUrlExpandedRowKeys] = useState([]);
  const [uniqueDates, setUniqueDates] = useState([]);
  const [brands, setBrands] = useState([]);
  const [category, setCategory] = useState([]);
  const [subCategory, setSubCategory] = useState([]);
  const [loading, setLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  const { user } = useContext(AuthContext);
  const userRole = user?.data?.user?.role || "";

  const [filter, setFilter] = useState({
    keyword: "",
    url: "",
    startDate: "",
    endDate: "",
    project: "",
    brand: "",
    category: "",
    subCategory: "",
    result_type: "",
    user: "",
  });
  const [selectedProjectId, setSelectedProjectId] = useState(filter.project);
  const [projectUser, setProjectUser] = useState(filter.user);

  const tabs = {
    keyword: "Keyword Ranking",
    url: "URL Ranking",
  };

  const resultType = [
    { key: "organic", value: "Organic" },
    { key: "paid", value: "Paid" },
    { key: "people_also_search", value: "People also search" },
    { key: "link_element", value: "Link element" },
    { key: "people_also_ask_expanded_element", value: "People also ask" },
    { key: "ai_overview_reference", value: "AI overview" },
  ];

  // Fetch projects once user is known
  useEffect(() => {
    if (user) {
      setFilter((prev) => ({ ...prev, user: user?._id }));
      setProjectUser(user?._id);
    }
  }, [user]);

  useEffect(() => {
    if (projectUser) {
      fetchProjects();
    }
  }, [projectUser]);

  const fetchProjects = async () => {
    try {
      const res = await getBingProjects({ user: projectUser });
      const fetched = res.data.projects || [];
      setProjects(fetched);

      if (fetched.length > 0 && !selectedProjectId) {
        const defaultProjectId =
          userRole === "admin" ? "688b6be40929c762b4087286" : fetched[0]._id;
        setFilter((prev) => ({ ...prev, project: defaultProjectId }));
        setSelectedProjectId(defaultProjectId);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  // Whenever filter, page, or tab changes, reload tasks
  useEffect(() => {
    if (filter.project) {
      fetchTasks(currentPage, activeKey);
    }
  }, [filter.project, filter.keyword, filter.url, filter.brand, filter.category, filter.subCategory, filter.result_type, filter.endDate, currentPage, activeKey]);

  const getEC = async () => {
    try {
      const res = await getBingExcel(selectedProjectId, filter);
      const tasksArr = res.data.tasks || [];
      const brandList = tasksArr.map((d) => d.Brand);
      const categoryList = tasksArr.map((d) => d.Category);
      const subCategoryList = tasksArr.map((d) => d.SubCategory);

      setBrands([...new Set(brandList)]);
      setCategory([...new Set(categoryList)]);
      setSubCategory([...new Set(subCategoryList)]);
    } catch (err) {
      console.error("Error fetching Excel metadata:", err);
    }
  };

  useEffect(() => {
    if (selectedProjectId && filter.project === selectedProjectId) {
      getEC();
    }
  }, [selectedProjectId, filter.project]);

  // const fetchTasks = async (page = 1, activeTabKey) => {
  //   setLoading(true)
  //   try {
  //     const { startDate, endDate } = filter;
  //     const formattedStart = startDate
  //       ? dayjs(startDate).format("YYYY-MM-DD")
  //       : "";
  //     const formattedEnd = endDate ? dayjs(endDate).format("YYYY-MM-DD") : "";

  //     const baseQuery = {
  //       tab: activeTabKey === "1" ? "keywordRanking" : "urlRanking",
  //       ...(activeTabKey === "1" &&
  //         filter.keyword && {
  //         keyword: filter.keyword,
  //       }),
  //       ...(activeTabKey === "2" && filter.url && { url: filter.url }),
  //       ...(formattedStart &&
  //         formattedEnd && {
  //         startDate: formattedStart,
  //         endDate: formattedEnd,
  //       }),
  //       ...(filter.project && { project: filter.project }),
  //       ...(filter.result_type && { result_type: filter.result_type }),
  //       ...(filter.category && { category: filter.category }),
  //       ...(filter.subCategory && { subCategory: filter.subCategory }),
  //       ...(filter.brand && { brand: filter.brand }),
  //     };

  //     const response = await getDailyRankingBingReport(page, 10, baseQuery);

  //     if (activeTabKey === "1") {
  //       setTasks(response.data.tasks || []);
  //     } else {
  //       setUrlTasks(response.data.tasks || []);
  //     }

  //     setTotalPages(response.data.totalPages || 0);
  //     setUniqueDates(response.data.uniqueDates || []);
  //   } catch (err) {
  //     console.error("Error fetching tasks:", err);
  //   } finally {
  //     setLoading(false)
  //   }
  // };

  const fetchTasks = async (page = 1, activeTabKey) => {
  setLoading(true);
  try {
    const { startDate, endDate } = filter;
    const formattedStart = startDate ? dayjs(startDate).format("YYYY-MM-DD") : "";
    const formattedEnd = endDate ? dayjs(endDate).format("YYYY-MM-DD") : "";

    const baseQuery = {
      tab: activeTabKey === "1" ? "keywordRanking" : "urlRanking",
      ...(activeTabKey === "1" && filter.keyword && { keyword: filter.keyword }),
      ...(activeTabKey === "2" && filter.url && { url: filter.url }),
      ...(formattedStart && formattedEnd && { startDate: formattedStart, endDate: formattedEnd }),
      ...(filter.project && { project: filter.project }),
      ...(filter.result_type && { result_type: filter.result_type }),
      ...(filter.category && { category: filter.category }),
      ...(filter.subCategory && { subCategory: filter.subCategory }),
      ...(filter.brand && { brand: filter.brand }),
      // t: Date.now(), // <-- ADD THIS
    };

    const response = await getDailyRankingBingReport(page, 10, baseQuery);

    if (activeTabKey === "1") setTasks(response.data.tasks || []);
    else setUrlTasks(response.data.tasks || []);

    setTotalPages(response.data.totalPages || 0);
    setUniqueDates(response.data.uniqueDates || []);
  } catch (err) {
    console.error("Error fetching tasks:", err);
  } finally {
    setLoading(false);
  }
};




  // ------------------------------------------------

  const handleExpand = (expanded, record) => {
    const key = record._id;
    setExpandedRowKeys((prev) =>
      expanded ? [...prev, key] : prev.filter((k) => k !== key)
    );
  };

  const handleUrlExpand = (expanded, record) => {
    const key = record._id;
    setUrlExpandedRowKeys((prev) =>
      expanded ? [...prev, key] : prev.filter((k) => k !== key)
    );
  };

  const exportData = async () => {
    try {
      setExportLoading(true);
      // const exportFilter = {
      //   ...(filter.keyword && { keyword: filter.keyword }),
      //   ...(filter.url && { url: filter.url }),
      //   ...(filter.project && { project: filter.project }),
      // };

       const exportFilter = {
      ...(filter.keyword && { keyword: filter.keyword }),
      ...(filter.url && { url: filter.url }),
      ...(filter.project && { project: filter.project }),
      ...(filter.brand && { brand: filter.brand }),
      ...(filter.category && { category: filter.category }),
      ...(filter.subCategory && { subCategory: filter.subCategory }),
      ...(filter.result_type && { result_type: filter.result_type }),
      ...(filter.startDate && { startDate: filter.startDate }),
      ...(filter.endDate && { endDate: filter.endDate }),
      // t: Date.now(), // cache-buster, same as fetchTasks
    };
      const response = await exportBingRankings(exportFilter);

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "bing_ranking.xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="project-dashboard container py-4">
      <div>
        <h6 className="mt-2" style={{ color: "#4a4a4a" }}>
          Ranking Report
        </h6>
      </div>

      {/* ───── FILTER CARD ───── */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row gy-3 gx-3 align-items-end">
            {/* PROJECT */}
            <div className="col-md-3">
              <label htmlFor="projectSelect" className="form-label fw-semibold">
                Project
              </label>
              <select
                id="projectSelect"
                className="form-control"
                value={filter.project}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilter((prev) => ({ ...prev, project: val }));
                  setSelectedProjectId(val);
                  setCurrentPage(1);
                }}
              >
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* BRAND */}
            <div className="col-md-3">
              <label htmlFor="brandSelect" className="form-label fw-semibold">
                Brand
              </label>
              <select
                id="brandSelect"
                className="form-control"
                value={filter.brand}
                onChange={(e) =>
                  setFilter((prev) => ({ ...prev, brand: e.target.value }))
                }
              >
                <option value="">All</option>
                {brands.map((b, idx) => (
                  <option key={idx} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* CATEGORY */}
            <div className="col-md-3">
              <label
                htmlFor="categorySelect"
                className="form-label fw-semibold"
              >
                Category
              </label>
              <select
                id="categorySelect"
                className="form-control"
                value={filter.category}
                onChange={(e) =>
                  setFilter((prev) => ({ ...prev, category: e.target.value }))
                }
              >
                <option value="">All</option>
                {category.map((c, idx) => (
                  <option key={idx} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* SUBCATEGORY */}
            <div className="col-md-3">
              <label
                htmlFor="subCategorySelect"
                className="form-label fw-semibold"
              >
                Sub Category
              </label>
              <select
                id="subCategorySelect"
                className="form-control"
                value={filter.subCategory}
                onChange={(e) =>
                  setFilter((prev) => ({
                    ...prev,
                    subCategory: e.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {subCategory.map((sc, idx) => (
                  <option key={idx} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>

            {/* RESULT TYPE */}
            <div className="col-md-2">
              <label
                htmlFor="resultTypeSelect"
                className="form-label fw-semibold"
              >
                Type
              </label>
              <select
                id="resultTypeSelect"
                className="form-control"
                value={filter.result_type}
                onChange={(e) =>
                  setFilter((prev) => ({
                    ...prev,
                    result_type: e.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {resultType.map((rt) => (
                  <option key={rt.key} value={rt.key}>
                    {rt.value}
                  </option>
                ))}
              </select>
            </div>

            {/* START DATE */}
            <div className="col-md-3">
              <label htmlFor="startDate" className="form-label fw-semibold">
                Start Date
              </label>
              <input
                id="startDate"
                type="date"
                className="form-control"
                value={filter.startDate?.substring(0, 10) || ""}
                onChange={(e) => {
                  setFilter((prev) => ({
                    ...prev,
                    startDate: e.target.value
                      ? dayjs(e.target.value).startOf("day").format("YYYY-MM-DDTHH:mm:ss")
                      : "",
                  }));
                }}
              />
            </div>

            {/* END DATE */}
            <div className="col-md-3">
              <label htmlFor="endDate" className="form-label fw-semibold">
                End Date
              </label>
              <input
                id="endDate"
                type="date"
                className="form-control"
                value={filter.endDate?.substring(0, 10) || ""}
                onChange={(e) => {
                  setFilter((prev) => ({
                    ...prev,
                    endDate: e.target.value
                      ? dayjs(e.target.value).startOf("day").format("YYYY-MM-DDTHH:mm:ss")
                      : "",
                  }));
                }}
              />
            </div>

            {/* Export Button */}
            <div className="col-md-1 align-items-end pt-6">
              <button
                style={{
                  background: exportLoading ? "#bdc3c7" : "#487fff",
                  color: "#fff",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: "5px",
                  cursor: exportLoading ? "not-allowed" : "pointer",
                  opacity: exportLoading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
                disabled={exportLoading}
                onClick={exportData}
              >
                {exportLoading ? (
                  <>
                    <span
                      style={{
                        fontWeight: "600px",
                        border: "2px solid #f3f3f3",
                        borderTop: "2px solid #2980b9",
                        borderRadius: "50%",
                        width: "14px",
                        height: "14px",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Exporting...
                  </>
                ) : (
                  "Export"
                )}
              </button>
            </div>

            {/* RESET */}
            <div className={`${exportLoading ? "col-md-1" : "col-md-2"} align-items-end pt-6`}>
              <button
                className="btn btn-secondary w-100"
                style={{
                  marginLeft: exportLoading ? "40px" : ""
                }}
                onClick={() =>
                  setFilter({
                    keyword: "",
                    url: "",
                    startDate: "",
                    endDate: "",
                    project: selectedProjectId,
                    brand: "",
                    category: "",
                    subCategory: "",
                    result_type: "",
                  })
                }
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ───── WRAP TABS INSIDE A SINGLE TABLE CARD ───── */}
      {loading ? (
        <div className="text-center p-4">
          <Spinner animation="border" />
        </div>
      ) : (
        <div className="card shadow-sm mt-20">
          {/* Card Header: contains the nav-pills (tabs) */}
          <div className="card-header py-8 px-24 bg-base border border-end-0 border-start-0 border-top-0">
            <ul className="nav focus-tab nav-pills mb-0" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className={
                    "nav-link fw-semibold text-primary-light radius-4 px-16 py-10 " +
                    (activeKey === "1" ? "active" : "")
                  }
                  id="pills-focus-home-tab"
                  type="button"
                  role="tab"
                  aria-controls="pills-focus-home"
                  aria-selected={activeKey === "1"}
                  onClick={() => {
                    setActiveKey("1");
                    setCurrentPage(1);
                  }}
                >
                  {tabs.keyword}
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={
                    "nav-link fw-semibold text-primary-light radius-4 px-16 py-10 " +
                    (activeKey === "2" ? "active" : "")
                  }
                  id="pills-focus-details-tab"
                  type="button"
                  role="tab"
                  aria-controls="pills-focus-details"
                  aria-selected={activeKey === "2"}
                  onClick={() => {
                    setActiveKey("2");
                    setCurrentPage(1);
                  }}
                >
                  {tabs.url}
                </button>
              </li>
            </ul>
          </div>

          {/* Card Body: contains the tab-content with the appropriate table */}
          <div className="card-body p-24 pt-10">
            <div className="tab-content" id="pills-tab-twoContent">
              {/* ── Pane for "Keyword Ranking" ── */}
              <div
                className={
                  "tab-pane fade " + (activeKey === "1" ? "show active" : "")
                }
                id="pills-focus-home"
                role="tabpanel"
                aria-labelledby="pills-focus-home-tab"
                tabIndex={0}
              >
                <table
                  className="table custom-table"
                  data-page-length="10"
                  style={{ border: "1px solid #ddd" }}
                >
                  <thead className="table-light">
                    <tr>
                      <th
                        style={{
                          width: "30%",
                          color: "#333333",
                          padding: "14px 20px",
                        }}
                      >
                        Keyword
                      </th>
                      {uniqueDates.map((date) => (
                        <th
                          key={date}
                          className="text-center"
                          style={{ color: "#333333", padding: "14px 20px" }}
                        >
                          {moment(date, "YY/MM/DD").format("DD MMM, YYYY")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((row) => {
                      const hasChildren =
                        Array.isArray(row.children) && row.children.length > 0;
                      const expanded = expandedRowKeys.includes(row._id);

                      return (
                        <React.Fragment key={row._id}>
                          {/* Parent row */}
                          <tr>
                            <td style={{ color: "#4B5563" }}>
                              {hasChildren && (
                                <button
                                  type="button"
                                  className="btn btn-link text-decoration-none p-0 me-2"
                                  onClick={() => handleExpand(!expanded, row)}
                                  aria-expanded={expanded}
                                  aria-controls={`kw-child-${row._id}`}
                                  style={{ lineHeight: 1 }}
                                >
                                  <div
                                    style={{
                                      color: "#222222",
                                      fontSize: "20px",
                                      lineHeight: 1,
                                      marginRight: "8px",
                                    }}
                                  >
                                    {expanded ? "▾" : "▸"}
                                  </div>
                                </button>
                              )}
                              {row.keyword}
                            </td>

                            {uniqueDates.map((date) => (
                              <td
                                key={date}
                                className="text-center"
                                style={{
                                  color: "#4b5563",
                                  padding: "16px",
                                }}
                              >
                                {row[date] || ""}
                              </td>
                            ))}
                          </tr>

                          {/* Children rows */}
                          {expanded &&
                            hasChildren &&
                            row.children.map((child) => (
                              <tr key={child._id} className="bg-light">
                                <td
                                  style={{
                                    paddingLeft: "40px",
                                    color: "#4b5563",
                                  }}
                                >
                                  <a
                                    href={child.keyword}
                                    title={child.keyword}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: "inline-block",
                                      maxWidth: 380,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    {(() => {
                                      const i = child.keyword.indexOf("#");
                                      return i >= 0
                                        ? child.keyword.slice(0, i + 1)
                                        : child.keyword;
                                    })()}
                                  </a>
                                </td>

                                {uniqueDates.map((date) => (
                                  <td
                                    key={date}
                                    className="text-center"
                                    style={{
                                      padding: "16px",
                                      color: "#4b5563",
                                    }}
                                  >
                                    {child[date] || ""}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                <nav className="d-flex justify-content-center mt-3">
                  <ul className="pagination mb-0 flex-wrap">
                    <li
                      className={`page-item ${currentPage === 1 ? "disabled" : ""
                        }`}
                    >
                      <button
                        className="page-link"
                        onClick={() =>
                          currentPage > 1 && setCurrentPage(currentPage - 1)
                        }
                      >
                        ‹
                      </button>
                    </li>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          (p >= currentPage - 2 && p <= currentPage + 2)
                      )
                      .map((p, index, array) => (
                        <React.Fragment key={p}>
                          {index > 0 && array[index - 1] !== p - 1 && (
                            <li className="page-item disabled">
                              <span className="page-link">…</span>
                            </li>
                          )}
                          <li
                            className={`page-item ${currentPage === p ? "active" : ""
                              }`}
                          >
                            <button
                              className="page-link"
                              onClick={() => setCurrentPage(p)}
                            >
                              {p}
                            </button>
                          </li>
                        </React.Fragment>
                      ))}

                    <li
                      className={`page-item ${currentPage === totalPages ? "disabled" : ""
                        }`}
                    >
                      <button
                        className="page-link"
                        onClick={() =>
                          currentPage < totalPages &&
                          setCurrentPage(currentPage + 1)
                        }
                      >
                        ›
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>

              {/* ── Pane for "URL Ranking" ── */}
              <div
                className={
                  "tab-pane fade " + (activeKey === "2" ? "show active" : "")
                }
                id="pills-focus-details"
                role="tabpanel"
                aria-labelledby="pills-focus-details-tab"
                tabIndex={0}
              >
                <table
                  className="table custom-table"
                  data-page-length="10"
                  style={{ border: "1px solid #ddd" }}
                >
                  <thead className="table-light">
                    <tr>
                      <th
                        style={{
                          width: "40%",
                          color: "#333333",
                          padding: "14px 20px",
                        }}
                      >
                        URL
                      </th>
                      {uniqueDates.map((date) => (
                        <th
                          key={date}
                          className="text-center"
                          style={{ color: "#333333", padding: "14px 20px" }}
                        >
                          {moment(date, "YY/MM/DD").format("DD MMM, YYYY")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {urlTasks.map((row) => {
                      const hasChildren =
                        Array.isArray(row.children) && row.children.length > 0;
                      const expanded = urlExpandedRowKeys.includes(row._id);
                      const colSpan = uniqueDates.length + 1;

                      return (
                        <React.Fragment key={row._id || `${row.parentId}-${row.url}`}>
                          {/* Parent URL row */}
                          <tr>
                            <td
                              style={{
                                color: "#4B5563",
                                padding: "14px 20px",
                                width: "40%",
                              }}
                            >
                              {hasChildren && (
                                <button
                                  type="button"
                                  className="btn btn-link p-0 me-2 text-decoration-none"
                                  onClick={() => handleUrlExpand(!expanded, row)}
                                  aria-expanded={expanded}
                                  aria-controls={`url-child-${row._id}`}
                                  style={{ lineHeight: 1 }}
                                >
                                  <div
                                    style={{
                                      color: "#222222",
                                      fontSize: "20px",
                                      lineHeight: 1,
                                    }}
                                  >
                                    {expanded ? "▾" : "▸"}
                                  </div>
                                </button>
                              )}

                              <a
                                href={row.url}
                                title={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-block",
                                  maxWidth: 300,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  verticalAlign: "middle",
                                }}
                              >
                                {(() => {
                                  const i = row.url.indexOf("#");
                                  return i >= 0
                                    ? row.url.slice(0, i + 1)
                                    : row.url;
                                })()}
                              </a>
                            </td>

                            {uniqueDates.map((date) => (
                              <td
                                key={date}
                                className="text-center"
                                style={{
                                  color: "#4b5563",
                                  padding: "14px 20px",
                                  width: `${60 / uniqueDates.length}%`,
                                }}
                              >
                                {row[date] === 101 || row[date] === ""
                                  ? ""
                                  : row[date]}
                              </td>
                            ))}
                          </tr>

                          {/* Children keywords */}
                          {expanded && hasChildren && (
                            <tr
                              id={`url-child-${row._id}`}
                              className="bg-light"
                            >
                              <td colSpan={colSpan} className="p-0">
                                <table
                                  className="table table-sm mb-0 custom-table"
                                  style={{ width: "100%" }}
                                >
                                  <tbody>
                                    {row.children.map((child) => (
                                      <tr key={child._id}>
                                        <td
                                          style={{
                                            padding: "14px 48px",
                                            width: "40%",
                                            color: "#4b5563",
                                          }}
                                        >
                                          {child.url}
                                        </td>

                                        {uniqueDates.map((date) => (
                                          <td
                                            key={date}
                                            className="text-center"
                                            style={{
                                              padding: "16px",
                                              width: `${60 / uniqueDates.length
                                                }%`,
                                              color: "#4b5563",
                                            }}
                                          >
                                            {child[date] === 101 ||
                                              child[date] === ""
                                              ? ""
                                              : child[date]}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                <nav className="d-flex justify-content-center mt-3">
                  <ul className="pagination mb-0 flex-wrap">
                    <li
                      className={`page-item ${currentPage === 1 ? "disabled" : ""
                        }`}
                    >
                      <button
                        className="page-link"
                        onClick={() =>
                          currentPage > 1 && setCurrentPage(currentPage - 1)
                        }
                      >
                        ‹
                      </button>
                    </li>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          (p >= currentPage - 2 && p <= currentPage + 2)
                      )
                      .map((p, index, array) => (
                        <React.Fragment key={p}>
                          {index > 0 && array[index - 1] !== p - 1 && (
                            <li className="page-item disabled">
                              <span className="page-link">…</span>
                            </li>
                          )}
                          <li
                            className={`page-item ${currentPage === p ? "active" : ""
                              }`}
                          >
                            <button
                              className="page-link"
                              onClick={() => setCurrentPage(p)}
                            >
                              {p}
                            </button>
                          </li>
                        </React.Fragment>
                      ))}

                    <li
                      className={`page-item ${currentPage === totalPages ? "disabled" : ""
                        }`}
                    >
                      <button
                        className="page-link"
                        onClick={() =>
                          currentPage < totalPages &&
                          setCurrentPage(currentPage + 1)
                        }
                      >
                        ›
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default BingRankings;
