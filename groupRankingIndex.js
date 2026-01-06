



import React, { useContext, useEffect, useState } from "react";
import { Table, Button } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import moment from "moment";
import { getAllRanks, getExcel, getProjects } from "../../services/api";
import AuthContext from "../../context/AuthContext";
import { Spinner } from "react-bootstrap";
import * as XLSX from "xlsx";

const RankGroupIndex = () => {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const { user } = useContext(AuthContext);
  const userRole = user?.role || "";

  const [filter, setFilter] = useState({
    keyword: "",
    url: "",
    dateRange: ["", ""],
    project: "",
    brand: "",
    category: "",
    subCategory: "",
    result_type: "",
    user: "",
  });

  const [selectedProjectId, setSelectedProjectId] = useState(filter.project);

  const resultTypeOptions = [
    { key: "organic", label: "Organic" },
    { key: "paid", label: "Paid" },
    { key: "people_also_ask_expanded_element", label: "People also ask" },
    { key: "link_element", label: "Link element" },
    { key: "local_pack", label: "Local pack" },
    { key: "ai_overview_reference", label: "AI overview" },
  ];

  useEffect(() => {
    if (filter.user) {
      fetchProjects();
    }
  }, [filter.user]);

  useEffect(() => {
    if (projects.length) {
      setFilter((prev) => ({
        ...prev,
        project: projects[0]._id,
      }));
    }
  }, [projects]);

  useEffect(() => {
    if (filter.project) {
      setSelectedProjectId(filter.project);
      fetchExcelData(filter.project, filter);
    }
  }, [filter.project, filter.brand, filter.category, filter.subCategory]);

  useEffect(() => {
    if (filter.project) {
      fetchRankData();
    }
  }, [filter]);

  useEffect(() => {
    if (user) {
      setFilter((prev) => ({
        ...prev,
        user: user?._id,
      }));
    }
  }, [user]);

  const fetchProjects = async () => {
    try {
      const response = await getProjects({ user: filter.user });
      setProjects(response.data.projects);
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  const fetchExcelData = async (projectId, currentFilter) => {
    try {
      const res = await getExcel(projectId, currentFilter);
      const tasks = res.data.tasks || [];
      setBrands([...new Set(tasks.map((item) => item.Brand))]);
      setCategoryOptions([...new Set(tasks.map((item) => item.Category))]);
      setSubCategoryOptions([...new Set(tasks.map((item) => item.SubCategory))]);
    } catch (err) {
      console.error("Error fetching Excel data:", err);
    }
  };

  const fetchRankData = async () => {
    setLoading(true);
    try {
      const [startDate, endDate] = filter.dateRange;
      const formattedStart = startDate ? dayjs(startDate).format("YYYY-MM-DD") : "";
      const formattedEnd = endDate ? dayjs(endDate).format("YYYY-MM-DD") : "";

      const filteredQuery = {
        ...(filter.keyword && { keyword: filter.keyword }),
        ...(formattedStart && formattedEnd && { startDate: formattedStart, endDate: formattedEnd }),
        ...(filter.project && { project: filter.project }),
        ...(filter.result_type && { result_type: filter.result_type }),
        ...(filter.category && { category: filter.category }),
        ...(filter.subCategory && { subCategory: filter.subCategory }),
        ...(filter.brand && { brand: filter.brand }),
      };

      const response = await getAllRanks(filteredQuery);
      const { data: transformedData, uniqueDates } = response.data;

      setData(transformedData);
      generateColumns(uniqueDates);
    } catch (err) {
      console.error("Error fetching rank group data:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateColumns = (uniqueDates) => {
    const dynamicColumns = [
      {
        title: "Rank Group",
        dataIndex: "rankGroup",
        key: "rankGroup",
        width: 180,
        align: "left",
      },
      ...uniqueDates.map((date) => ({
        title: (
          <div style={{ textAlign: "center" }}>
            {moment(date).format("DD MMM, YYYY")}
          </div>
        ),
        key: date,
        children: [
          { title: "KW", dataIndex: `${date}_keywordCount`, key: `${date}_keywordCount`, width: 100, align: "center" },
          { title: "SV", dataIndex: `${date}_searchVolume`, key: `${date}_searchVolume`, width: 100, align: "center" },
          { title: "SOV(%)", dataIndex: `${date}_sov`, key: `${date}_sov`, width: 100, align: "center" },
        ],
      })),
    ];
    setColumns(dynamicColumns);
  };

  const handleReset = () => {
    setFilter({
      keyword: "",
      url: "",
      dateRange: ["", ""],
      project: selectedProjectId,
      brand: "",
      category: "",
      subCategory: "",
      result_type: "",
      user: filter?.user,
    });
  };

  // IMPROVED DOWNLOAD LOGIC
  const downloadExcel = () => {
    if (data.length === 0) return;

    const exportData = data.map((row) => {
      const excelRow = {};
      // 1. Set first static column
      excelRow["Rank Group"] = row.rankGroup;

      // 2. Map dynamic date columns from the 'columns' state definition
      columns.forEach((col) => {
        if (col.children) {
          // Format the date for the header (e.g., 01 Nov 2025)
          const dateHeader = moment(col.key).format("DD MMM YYYY");
          
          col.children.forEach((child) => {
            // Combine Date and Metric name (e.g., "01 Nov 2025 - SOV(%)")
            const combinedKey = `${dateHeader} - ${child.title}`;
            excelRow[combinedKey] = row[child.dataIndex] || 0;
          });
        }
      });
      return excelRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking Report");
    XLSX.writeFile(workbook, `Ranking_Report_${dayjs().format("YYYY-MM-DD")}.xlsx`);
  };

  return (
    <div className="project-dashboard container py-4">
      <h6 className="mt-2" style={{ color: "#4a4a4a" }}>Group Wise Ranking Report</h6>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row gy-3 gx-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label fw-semibold">Project</label>
              <select className="form-control" value={filter.project} onChange={(e) => setFilter((prev) => ({ ...prev, project: e.target.value }))}>
                {projects.map((p) => <option key={p._id} value={p._id}>{p.project_name}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label fw-semibold">Brand</label>
              <select className="form-control" value={filter.brand} onChange={(e) => setFilter((prev) => ({ ...prev, brand: e.target.value }))}>
                <option value="">All</option>
                {brands.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label fw-semibold">Category</label>
              <select className="form-control" value={filter.category} onChange={(e) => setFilter((prev) => ({ ...prev, category: e.target.value }))}>
                <option value="">All</option>
                {categoryOptions.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label fw-semibold">Sub Category</label>
              <select className="form-control" value={filter.subCategory} onChange={(e) => setFilter((prev) => ({ ...prev, subCategory: e.target.value }))}>
                <option value="">All</option>
                {subCategoryOptions.map((sc, i) => <option key={i} value={sc}>{sc}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">Type</label>
              <select className="form-control" value={filter.result_type} onChange={(e) => setFilter((prev) => ({ ...prev, result_type: e.target.value }))}>
                <option value="">All</option>
                {resultTypeOptions.map((rt) => <option key={rt.key} value={rt.key}>{rt.label}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold">Start Date</label>
              <input type="date" className="form-control" value={filter.dateRange[0]} onChange={(e) => setFilter((prev) => ({ ...prev, dateRange: [e.target.value, prev.dateRange[1]] }))} />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold">End Date</label>
              <input type="date" className="form-control" value={filter.dateRange[1]} onChange={(e) => setFilter((prev) => ({ ...prev, dateRange: [prev.dateRange[0], e.target.value] }))} />
            </div>
            <div className="col-md-2">
              <button className="btn btn-secondary w-100" onClick={handleReset}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-4"><Spinner animation="border" /></div>
      ) : (
        <div className="table-wrapper mt-4">
          <div className="d-flex justify-content-end mb-3">
            <Button type="primary" icon={<DownloadOutlined />} onClick={downloadExcel} disabled={data.length === 0}>
              Download Excel
            </Button>
          </div>
          <Table
            className="custom-table"
            rowKey="rankGroup"
            columns={columns}
            dataSource={data}
            pagination={false}
            scroll={{ x: "max-content" }}
          />
        </div>
      )}
    </div>
  );
};

export default RankGroupIndex;
