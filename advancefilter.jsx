import React, { useEffect, useMemo, useState } from "react";
import {
  compareLLMBrandMentionsByDates,
  compareLLMMyPagesCitedByDates,
  compareLLMPagesMentioningMeByDates,
  getLLMProjects,
} from "../../services/api";
import { showToast } from "../../lib/CustomToast";
import "./LLMAdvanceFilter.css";

const TAB_BRAND_MENTION = "Brand Mention";
const TAB_MY_PAGE_CITED = "My Page Cited";
const TAB_PAGES_MENTIONING = "Pages Mentioning Me";
const tabs = [TAB_BRAND_MENTION, TAB_MY_PAGE_CITED, TAB_PAGES_MENTIONING];

const statusOptions = ["All Status", "Gained", "Lost", "Retained"];

const LLM_NAME_MAP = {
  chatgpt: "ChatGPT",
  ai_overview: "AI Mode",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
};

const KPI_COLORS = {
  primary: "#2563eb",
  info: "#0ea5e9",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#f97316",
  neutral: "#64748b",
};

const normalizeUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(
      value.url ||
        value.link ||
        value.href ||
        value.source ||
        value.page ||
        value.value ||
        ""
    ).trim();
  }
  return String(value).trim();
};

const normalizeUrls = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeUrl))).filter(Boolean);
};

const countUniqueUrls = (rows, key) => {
  const set = new Set();
  rows.forEach((row) => {
    const urls = normalizeUrls(row?.[`${key}Urls`]);
    urls.forEach((url) => set.add(url));
  });
  return set.size;
};

const getStatusCounts = (rows) => {
  const counts = { gained: 0, lost: 0, retained: 0 };
  rows.forEach((row) => {
    const status = String(row?.status || "").toLowerCase();
    if (status === "gained") counts.gained += 1;
    else if (status === "lost") counts.lost += 1;
    else if (status === "retained") counts.retained += 1;
  });
  return counts;
};

const filterInStatus = (rows, status) => {
  if (!status || status === "all") return rows;
  return rows.filter((row) => String(row?.status || "").toLowerCase() === status);
};

const KpiCard = ({ label, value, color }) => (
  <div className="col">
    <div className="kpi-card">
      <span className="kpi-border" style={{ backgroundColor: color }} />
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value ?? "-"}</div>
      </div>
    </div>
  </div>
);

const KpiCardRow = ({ items }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="row row-cols-lg-6 row-cols-md-3 row-cols-1 g-3 mb-3">
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  );
};

const LLMAdvanceFilter = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [status, setStatus] = useState("all");
  const [activeTab, setActiveTab] = useState(TAB_BRAND_MENTION);

  const [brandRows, setBrandRows] = useState([]);
  const [brandLoading, setBrandLoading] = useState(false);
  const [myPageRows, setMyPageRows] = useState([]);
  const [myPageLoading, setMyPageLoading] = useState(false);
  const [pagesMentioningRows, setPagesMentioningRows] = useState([]);
  const [pagesMentioningLoading, setPagesMentioningLoading] = useState(false);

  const [brandMeta, setBrandMeta] = useState({ baselinePrompts: 0 });
  const [myPageMeta, setMyPageMeta] = useState({ baselinePrompts: 0 });
  const [pagesMentioningMeta, setPagesMentioningMeta] = useState({ baselinePrompts: 0 });

  const selectedProject = useMemo(() => projects.find((p) => p._id === selectedProjectId) || null, [
    projects,
    selectedProjectId,
  ]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await getLLMProjects();
        const list = res?.data?.projects || [];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId(list[0]._id);
        }
      } catch (error) {
        showToast(error?.response?.data?.error || error?.message || "Failed to load projects", "error");
      }
    };

    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setSelectedDomain(selectedProject.target || "");
    const types = Array.isArray(selectedProject.type) ? selectedProject.type : [];
    setPlatforms(types);
    setSelectedPlatforms(types);
  }, [selectedProject]);

  const projectDomainOptions = useMemo(() => {
    if (!selectedProject) return [];
    const opts = [];
    if (selectedProject.target) {
      opts.push({ label: `${selectedProject.brand || "My Brand"} (${selectedProject.target})`, value: selectedProject.target });
    }
    const competitors = Array.isArray(selectedProject.competitors) ? selectedProject.competitors : [];
    competitors.forEach((competitor) => {
      if (competitor?.domain) {
        opts.push({ label: `${competitor.brand || "Competitor"} (${competitor.domain})`, value: competitor.domain });
      }
    });
    return opts;
  }, [selectedProject]);

  const buildFilters = () => {
    if (!selectedProjectId || !selectedDomain) return null;
    const platformList = selectedPlatforms.length > 0 ? selectedPlatforms : platforms;
    const filters = {
      projectId: selectedProjectId,
      myPage: selectedDomain,
      platforms: (platformList || []).map((p) => String(p).toLowerCase()),
    };
    if (d1) filters.d1 = d1;
    if (d2) filters.d2 = d2;
    if (status && status !== "all") filters.statusFilter = status;
    return filters;
  };

  const fetchBrandMentions = async () => {
    const filters = buildFilters();
    if (!filters) return;
    try {
      setBrandLoading(true);
      const res = await compareLLMBrandMentionsByDates({ filters, page: 1, limit: 50 });
      const data = res?.data?.data || {};
      setBrandRows(data.rows || []);
      setBrandMeta({ baselinePrompts: data?.meta?.baselinePrompts || data?.pagination?.totalRows || 0 });
    } catch (error) {
      showToast(error?.response?.data?.error || error?.message || "Failed to load brand mentions", "error");
      setBrandRows([]);
    } finally {
      setBrandLoading(false);
    }
  };

  const fetchMyPages = async () => {
    const filters = buildFilters();
    if (!filters) return;
    try {
      setMyPageLoading(true);
      const res = await compareLLMMyPagesCitedByDates({ filters, page: 1, limit: 50 });
      const data = res?.data?.data || {};
      setMyPageRows(data.rows || []);
      setMyPageMeta({ baselinePrompts: data?.meta?.baselinePrompts || data?.pagination?.totalRows || 0 });
    } catch (error) {
      showToast(error?.response?.data?.error || error?.message || "Failed to load My Page Cited", "error");
      setMyPageRows([]);
    } finally {
      setMyPageLoading(false);
    }
  };

  const fetchPagesMentioning = async () => {
    const filters = buildFilters();
    if (!filters) return;
    try {
      setPagesMentioningLoading(true);
      const res = await compareLLMPagesMentioningMeByDates({ filters, page: 1, limit: 50 });
      const data = res?.data?.data || {};
      setPagesMentioningRows(data.rows || []);
      setPagesMentioningMeta({ baselinePrompts: data?.meta?.baselinePrompts || data?.pagination?.totalRows || 0 });
    } catch (error) {
      showToast(error?.response?.data?.error || error?.message || "Failed to load Pages Mentioning Me", "error");
      setPagesMentioningRows([]);
    } finally {
      setPagesMentioningLoading(false);
    }
  };

  const handleCompare = () => {
    fetchBrandMentions();
    fetchMyPages();
    fetchPagesMentioning();
  };

  const handleReset = () => {
    setD1("");
    setD2("");
    setSelectedPlatforms(platforms);
    setStatus("all");
    setBrandRows([]);
    setMyPageRows([]);
    setPagesMentioningRows([]);
  };

  const brandStatusCounts = useMemo(() => getStatusCounts(filterInStatus(brandRows, status)), [brandRows, status]);
  const pagesMentioningStatusCounts = useMemo(() => getStatusCounts(filterInStatus(pagesMentioningRows, status)), [
    pagesMentioningRows,
    status,
  ]);

  const myPageKpis = useMemo(
    () => [
      { label: "Rows", value: myPageRows.length, color: KPI_COLORS.primary },
      { label: "Unique D1 URLs", value: countUniqueUrls(myPageRows, "d1"), color: KPI_COLORS.info },
      { label: "Unique D2 URLs", value: countUniqueUrls(myPageRows, "d2"), color: KPI_COLORS.success },
      { label: "Rows with URLs", value: myPageRows.filter((row) => (row?.d1Urls?.length || row?.d2Urls?.length)).length, color: KPI_COLORS.neutral },
      { label: "Baseline", value: myPageMeta.baselinePrompts || myPageRows.length, color: KPI_COLORS.warning },
      { label: "Gained", value: brandStatusCounts.gained, color: KPI_COLORS.success },
    ],
    [myPageRows, myPageMeta, brandStatusCounts]
  );

  const activeKpiItems = useMemo(() => {
    if (activeTab === TAB_BRAND_MENTION) {
      return [
        { label: "Rows", value: brandRows.length, color: KPI_COLORS.primary },
        { label: "All Rows", value: brandMeta.baselinePrompts || brandRows.length, color: KPI_COLORS.info },
        { label: "Gained", value: brandStatusCounts.gained, color: KPI_COLORS.success },
        { label: "Lost", value: brandStatusCounts.lost, color: KPI_COLORS.danger },
        { label: "Retained", value: brandStatusCounts.retained, color: KPI_COLORS.neutral },
        { label: "URL Changed", value: countUniqueUrls(pagesMentioningRows, "d1") + countUniqueUrls(pagesMentioningRows, "d2"), color: KPI_COLORS.warning },
      ];
    }

    if (activeTab === TAB_MY_PAGE_CITED) {
      return myPageKpis;
    }

    return [
      { label: "Rows", value: pagesMentioningRows.length, color: KPI_COLORS.primary },
      { label: "Baseline", value: pagesMentioningMeta.baselinePrompts || pagesMentioningRows.length, color: KPI_COLORS.info },
      { label: "D1 URLs", value: countUniqueUrls(pagesMentioningRows, "d1"), color: KPI_COLORS.info },
      { label: "D2 URLs", value: countUniqueUrls(pagesMentioningRows, "d2"), color: KPI_COLORS.success },
      { label: "Gained", value: pagesMentioningStatusCounts.gained, color: KPI_COLORS.success },
      { label: "Lost", value: pagesMentioningStatusCounts.lost, color: KPI_COLORS.danger },
    ];
  }, [
    activeTab,
    brandRows.length,
    brandMeta,
    brandStatusCounts,
    pagesMentioningRows,
    pagesMentioningMeta,
    pagesMentioningStatusCounts,
    myPageKpis,
  ]);

  const platformLabel = (platform) => {
    if (!platform) return "-";
    return LLM_NAME_MAP[String(platform).toLowerCase()] || platform;
  };

  const renderYesNoBadge = (value) => {
    if (value === null || value === undefined || value === "") {
      return <span className="badge badge-pill badge-neutral">-</span>;
    }
    const normalized = String(value).toLowerCase();
    const isYes = normalized === "yes" || normalized === "y" || normalized === "true";
    const isNo = normalized === "no" || normalized === "n" || normalized === "false";
    const label = isYes ? "YES" : isNo ? "NO" : String(value).toUpperCase();
    return (
      <span className={`badge badge-pill ${isYes ? "badge-yes" : isNo ? "badge-no" : "badge-neutral"}`}>
        {label}
      </span>
    );
  };

  const renderStatusPill = (statusValue) => {
    if (!statusValue) return <span className="badge badge-pill badge-neutral">-</span>;
    const normalized = String(statusValue).toLowerCase();
    const statusClass =
      normalized === "gained"
        ? "badge-status-gained"
        : normalized === "lost"
          ? "badge-status-lost"
          : normalized === "retained"
            ? "badge-status-retained"
            : "badge-neutral";
    return <span className={`badge badge-pill ${statusClass}`}>{String(statusValue).toUpperCase()}</span>;
  };

  const renderStatusBadge = (statusValue) => {
    if (!statusValue) return <span className="badge badge-soft-secondary">-</span>;
    const normalized = String(statusValue || "").toLowerCase();
    return (
      <span
        className={`badge badge-soft-${
          normalized === "gained" ? "success" : normalized === "lost" ? "danger" : normalized === "retained" ? "info" : "secondary"
        }`}
      >
        {String(statusValue).toUpperCase()}
      </span>
    );
  };

  const brandRowsToDisplay = useMemo(() => filterInStatus(brandRows, status), [brandRows, status]);
  const brandRowsByPlatform = useMemo(
    () =>
      brandRowsToDisplay.flatMap((row) => {
        const platformList =
          Array.isArray(row.platforms) && row.platforms.length > 0
            ? row.platforms
            : row.platform
              ? [row.platform]
              : [null];
        return platformList.map((platform) => ({ ...row, platform }));
      }),
    [brandRowsToDisplay]
  );

  return (
    <div className="llm-advance-page">
      <div className="llm-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab-pill ${activeTab === tab ? "tab-pill-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="card shadow-sm mb-4 filter-card">
        <div className="card-body">
          <div className="row gy-3 gx-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label fw-semibold">Project</label>
              <select className="form-control" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">D1 Date</label>
              <input className="form-control" type="date" value={d1} onChange={(e) => setD1(e.target.value)} />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">D2 Date</label>
              <input className="form-control" type="date" value={d2} onChange={(e) => setD2(e.target.value)} />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">Platforms</label>
              <select className="form-control" value={selectedPlatforms[0] || ""} onChange={(e) => setSelectedPlatforms(e.target.value ? [e.target.value] : [])}>
                <option value="">All Platforms</option>
                {platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platformLabel(platform)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">Status</label>
              <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value.toLowerCase())}>
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt === "All Status" ? "all" : opt.toLowerCase()}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-1 d-flex flex-column gap-2">
              <button className="btn btn-primary btn-llm" onClick={handleCompare} disabled={!selectedProjectId || !selectedDomain}>
                Compare
              </button>
              <button className="btn btn-outline-secondary btn-llm-outline" onClick={handleReset}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card metrics-card">
        <div className="card-body">
          <KpiCardRow items={activeKpiItems} />
          {activeTab === TAB_BRAND_MENTION && (
            <div className="results-header">
              <h3 className="results-title">Results</h3>
              <div className="results-count">{brandRowsByPlatform.length} rows</div>
            </div>
          )}
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  {activeTab === TAB_BRAND_MENTION ? (
                    <>
                      <th>Prompt</th>
                      <th>LLM Platform</th>
                      <th>Brand Mention</th>
                      <th>D1</th>
                      <th>D2</th>
                      <th>Status</th>
                    </>
                  ) : (
                    <>
                      <th>Prompt</th>
                      <th>LLM</th>
                      <th>D1</th>
                      <th>D2</th>
                      <th>D1 URLs</th>
                      <th>D2 URLs</th>
                      <th>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeTab === TAB_BRAND_MENTION &&
                  (brandLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        Loading brand mentions...
                      </td>
                    </tr>
                  ) : brandRowsByPlatform.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No results yet. Click Compare to load data.
                      </td>
                    </tr>
                  ) : (
                    brandRowsByPlatform.map((row, idx) => {
                      const brandMentionValue =
                        row.brandMention || row.brand_mention || ((row.d1 || "").toLowerCase() === "yes" || (row.d2 || "").toLowerCase() === "yes" ? "yes" : "no");
                      const platformText = row.platform ? platformLabel(row.platform) : "-";
                      return (
                        <tr key={`${row.prompt}-${row.platform || "unknown"}-${idx}`}>
                          <td>{row.prompt}</td>
                          <td>{platformText}</td>
                          <td>{renderYesNoBadge(brandMentionValue)}</td>
                          <td>{renderYesNoBadge(row.d1)}</td>
                          <td>{renderYesNoBadge(row.d2)}</td>
                          <td>{renderStatusPill(row.status)}</td>
                        </tr>
                      );
                    })
                  ))}

                {activeTab === TAB_MY_PAGE_CITED &&
                  (myPageLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        Loading citations...
                      </td>
                    </tr>
                  ) : myPageRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No results yet. Click Compare to load data.
                      </td>
                    </tr>
                  ) : (
                    myPageRows.map((row, idx) => (
                      <tr key={`${row.prompt}-${idx}`}>
                        <td>{row.prompt}</td>
                        <td>{platformLabel(row.platform || row.platforms?.[0])}</td>
                        <td>{String(row.d1 || "-").toUpperCase()}</td>
                        <td>{String(row.d2 || "-").toUpperCase()}</td>
                        <td>{(row.d1Urls || []).slice(0, 2).join(", ") || "-"}</td>
                        <td>{(row.d2Urls || []).slice(0, 2).join(", ") || "-"}</td>
                        <td>{renderStatusBadge(row.status)}</td>
                      </tr>
                    ))
                  ))}

                {activeTab === TAB_PAGES_MENTIONING &&
                  (pagesMentioningLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        Loading mentions...
                      </td>
                    </tr>
                  ) : pagesMentioningRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No results yet. Click Compare to load data.
                      </td>
                    </tr>
                  ) : (
                    pagesMentioningRows.map((row, idx) => (
                      <tr key={`${row.prompt}-${idx}`}>
                        <td>{row.prompt}</td>
                        <td>{platformLabel(row.platform || row.platforms?.[0])}</td>
                        <td>{String(row.d1 || "-").toUpperCase()}</td>
                        <td>{String(row.d2 || "-").toUpperCase()}</td>
                        <td>{(row.d1Urls || []).slice(0, 2).join(", ") || "-"}</td>
                        <td>{(row.d2Urls || []).slice(0, 2).join(", ") || "-"}</td>
                        <td>{renderStatusBadge(row.status)}</td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LLMAdvanceFilter;
