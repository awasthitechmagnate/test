// import React, { useContext, useEffect, useState } from "react";
// import { Table, DatePicker, Select, Tabs } from "antd";
// import dayjs from "dayjs";
// import weekday from "dayjs/plugin/weekday";
// import localeData from "dayjs/plugin/localeData";
// import {
//   getRankTracking,
//   getProjects,
//   getExcel,
//   getExitRankTracking,
// } from "../../services/api";
// // import "../../styles/RankingReport.css";
// import moment from "moment";
// import AuthContext from "../../context/AuthContext";

// const { RangePicker } = DatePicker;
// const { Option } = Select;

// dayjs.extend(weekday);
// dayjs.extend(localeData);

// const RankTracker = () => {
//   const [enteredData, setEnteredData] = useState({});
//   const [exitedData, setExitedData] = useState({});
//   const [columns, setColumns] = useState([]);
//   const [projects, setProjects] = useState([]);
//   const [brands, setBrands] = useState([]);
//   const [category, setCategory] = useState();
//   const [subCategory, setSubCategory] = useState();
//   const [activeTab, setActiveTab] = useState("entered");
//   const { user } = useContext(AuthContext);
//   const userRole = user?.data?.user?.role || "";
//   const [filter, setFilter] = useState({
//     keyword: "",
//     url: "",
//     dateRange: ["2025-03-26T18:30:00.000Z", "2025-03-27T18:30:00.000Z"],
//     project: "",
//     brand: "",
//     category: "",
//     subCategory: "",
//     result_type: "",
//   });
//   const [projectUser, setProjectUser] = useState(filter.user);
//   const [selectedProjectId, setSelectedProjectId] = useState(filter.project);

//   let resultType = [
//     { key: "organic", value: "Organic" },
//     { key: "paid", value: "Paid" },
//     { key: "people_also_ask_expanded_element", value: "People also ask" },
//     { key: "link_element", value: "Link element" },
//     { key: "local_pack", value: "Local pack" },
//     { key: "ai_overview_reference", value: "AI overview" },
//   ];

//   useEffect(() => {
//     if (projectUser) {
//       fetchProjects();
//     }
//   }, [projectUser]);

//   useEffect(() => {
//     fetchRankData(filter.dateRange);
//   }, [filter]);

//   const fetchProjects = async () => {
//     const res = await getProjects(filter);
//     setProjects(res.data.projects);
//   };

//   useEffect(() => {
//     if (user) {
//       setFilter((prev) => ({
//         ...prev,
//         user: user?.data?.user?._id,
//       }));
//       setProjectUser(user?.data?.user?._id);
//     }
//   }, [user]);

//   useEffect(() => {
//     if (projects.length > 0 && !selectedProjectId) {
//       const firstProjectId =
//         userRole === "admin" ? "67e2e957eaa96687a1297e6c" : projects[0]?._id;

//       setFilter((prev) => ({
//         ...prev,
//         project: firstProjectId,
//       }));
//       setSelectedProjectId(firstProjectId);
//     }
//   }, [projects, selectedProjectId]);

//   const getEC = async () => {
//     const getExcelData = await getExcel(selectedProjectId, filter);
//     let brands = getExcelData.data.metadata.brands;
//     let uniqueBrands = [...new Set(brands)];

//     let category = getExcelData.data.metadata.categories;
//     let uniqueCategory = [...new Set(category)];

//     let subCategory = getExcelData.data.metadata.subCategories;
//     let uniqueSubCategory = [...new Set(subCategory)];
//     setBrands(uniqueBrands);
//     setCategory(uniqueCategory);
//     setSubCategory(uniqueSubCategory);
//   };

//   useEffect(() => {
//     if (selectedProjectId && filter.project === selectedProjectId) {
//       getEC();
//     }
//   }, [selectedProjectId, filter.project]);

//   const fetchRankData = async () => {
//     try {
//       const startDate = filter.dateRange?.[0]
//         ? dayjs(filter.dateRange[0]).format("YYYY-MM-DD")
//         : "";

//       const endDate = filter.dateRange?.[1]
//         ? dayjs(filter.dateRange[1]).format("YYYY-MM-DD")
//         : "";

//       const filteredQuery = {
//         ...(filter?.keyword && { keyword: filter.keyword }),
//         ...(filter?.url && { url: filter.url }),
//         ...(startDate && endDate && { startDate, endDate }),
//         ...(filter.project && { project: filter.project }),
//         ...(filter.result_type && { result_type: filter.result_type }),
//         ...(filter.category && { category: filter.category }),
//         ...(filter.subCategory && { subCategory: filter.subCategory }),
//         ...(filter.brand && { brand: filter.brand }),
//       };

//       const response = await getRankTracking({
//         ...filteredQuery,
//         startDate,
//         endDate,
//       });

//       const exitedResponse = await getExitRankTracking({
//         ...filteredQuery,
//         startDate,
//         endDate,
//       });

//       setEnteredData(response.data);
//       setExitedData(exitedResponse.data);
//       generateColumns(startDate, endDate);
//     } catch (err) {
//       console.error("Error fetching rank data:", err);
//     }
//   };

//   const generateColumns = (startDate, endDate) => {
//     setColumns([
//       { title: "Keyword", dataIndex: "keyword", key: "keyword" },
//       {
//         title: `${moment(endDate).format("DD MMM,YYYY")} (End Date)`,
//         dataIndex: "endRank",
//         key: "endRank",
//       },
//       {
//         title: `${startDate} (Start Date)`,
//         dataIndex: "startRank",
//         key: "startRank",
//       },
//     ]);
//   };

//   const renderEnteredTable = (rankGroup, title, data) => {
//     if (!data[rankGroup] || data[rankGroup].length === 0) return null;
//     return (
//       <div key={rankGroup}>
//         <p>{title}</p>
//         <Table
//           rowKey="keyword"
//           columns={columns}
//           dataSource={enteredData[rankGroup]?.keywords || []}
//         />
//       </div>
//     );
//   };

//   const renderExitedTable = (rankGroup, title, data) => {
//     if (!data[rankGroup] || data[rankGroup].length === 0) return null;
//     return (
//       <div>
//         <p>{title}</p>
//         <Table
//           rowKey="keyword"
//           columns={columns}
//           dataSource={exitedData[rankGroup]?.keywords || []}
//         />
//       </div>
//     );
//   };

//   const enteredTables = [
//     { rank: "Rank 1", title: "Entered in Top 1" },
//     { rank: "Rank 2-3", title: "Entered in Top 3" },
//     { rank: "Rank 4-5", title: "Entered in Top 5" },
//     { rank: "Rank 6-10", title: "Entered in Top 10" },
//   ]
//     .map(({ rank, title }) => renderEnteredTable(rank, title, enteredData))
//     .filter(Boolean);

//   const exitedTables = [
//     { rank: "Rank 1", title: "Exit from Top 1" },
//     { rank: "Rank 2-3", title: "Exit from Top 3" },
//     { rank: "Rank 4-5", title: "Exit from Top 5" },
//     { rank: "Rank 6-10", title: "Exit from Top 10" },
//   ]
//     .map(({ rank, title }) => renderExitedTable(rank, title, exitedData))
//     .filter(Boolean);

//   const items = [
//     {
//       key: "entered",
//       label: "Rank Gains",
//       children: enteredTables.length ? enteredTables : <p>No data available</p>,
//     },
//     {
//       key: "exited",
//       label: "Rank Losses",
//       children: exitedTables.length ? exitedTables : <p>No data available</p>,
//     },
//   ];

//   return (
//     <div className="rank-group-container">
//       <h2>Keywords Movement</h2>
//       <div className="filter-section">
//         {/* First Row - 5 Filters */}
//         <div className="filter-row">
//           <div className="filter-item">
//             <span>Project</span>
//             <Select
//               placeholder="Filter by projects"
//               value={filter.project}
//               onChange={(value) => {
//                 setFilter((prev) => ({ ...prev, project: value }));
//                 setSelectedProjectId(value);
//               }}
//             >
//               {/* <Option value="">All</Option> */}
//               {projects.map((project) => (
//                 <Option key={project._id} value={project._id}>
//                   {project.project_name}
//                 </Option>
//               ))}
//             </Select>
//           </div>

//           <div className="filter-item">
//             <span>Brand</span>
//             <Select
//               placeholder="Filter by Brand"
//               value={filter.brand}
//               onChange={(value) =>
//                 setFilter((prev) => ({ ...prev, brand: value }))
//               }
//             >
//               <Option value="">All</Option>
//               {brands.map((item, index) => (
//                 <Option key={index} value={item}>
//                   {item}
//                 </Option>
//               ))}
//             </Select>
//           </div>

//           <div className="filter-item">
//             <span>Category</span>
//             <Select
//               placeholder="Category"
//               value={filter.category}
//               onChange={(value) =>
//                 setFilter((prev) => ({ ...prev, category: value }))
//               }
//             >
//               <Option value="">All</Option>
//               {category?.map((item, index) => (
//                 <Option key={index} value={item}>
//                   {item}
//                 </Option>
//               ))}
//             </Select>
//           </div>

//           <div className="filter-item">
//             <span>Sub Category</span>
//             <Select
//               placeholder="Sub Category"
//               value={filter.subCategory}
//               onChange={(value) =>
//                 setFilter((prev) => ({ ...prev, subCategory: value }))
//               }
//             >
//               <Option value="">All</Option>
//               {subCategory?.map((item, index) => (
//                 <Option key={index} value={item}>
//                   {item}
//                 </Option>
//               ))}
//             </Select>
//           </div>

//           <div className="filter-item">
//             <span>Type</span>
//             <Select
//               placeholder="Type"
//               value={filter?.result_type}
//               onChange={(value) =>
//                 setFilter((prev) => ({ ...prev, result_type: value }))
//               }
//             >
//               <Option value="">All</Option>
//               {resultType.map((item) => (
//                 <Option key={item.key} value={item.key}>
//                   {item.value}
//                 </Option>
//               ))}
//             </Select>
//           </div>
//         </div>

//         {/* Second Row - Date Filter, Search, Reset Button */}
//         <div className="filter-row">
//           <div className="filter-item">
//             <span>Date Range</span>

//             <RangePicker
//               value={
//                 filter.dateRange?.[0]
//                   ? [dayjs(filter.dateRange[0]), dayjs(filter.dateRange[1])]
//                   : []
//               }
//               onChange={(dates) =>
//                 setFilter((prev) => ({
//                   ...prev,
//                   dateRange: dates
//                     ? [dates[0]?.toISOString(), dates[1]?.toISOString()]
//                     : [],
//                 }))
//               }
//             />
//           </div>
//           <div className="filter-item-reset">
//             <span>&nbsp;</span>
//             <button
//               // className="reset-btn"
//               style={{
//                 background: "#2980b9",
//                 color: "#fff",
//                 border: "none",
//                 padding: "8px 12px",
//                 borderRadius: "5px",
//                 cursor: "pointer",
//               }}
//               onClick={() =>
//                 setFilter({
//                   keyword: "",
//                   url: "",
//                   dateRange: [],
//                   project: "67dd1920d59ef5f5103f984d",
//                 })
//               }
//             >
//               Reset
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Tables */}
//       <div>
//         <Tabs
//           activeKey={activeTab}
//           onChange={(key) => setActiveTab(key)}
//           items={items}
//         />
//       </div>
//     </div>
//   );
// };

// export default RankTracker;


// ------------------------------------------------------------

import React, { useContext, useEffect, useState } from "react";
import {  Button } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { Table } from "antd";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import moment from "moment";
import * as XLSX from "xlsx";
import {
  getRankTracking,
  getProjects,
  getExcel,
  getExitRankTracking,
} from "../../services/api";
import AuthContext from "../../context/AuthContext";

dayjs.extend(weekday);
dayjs.extend(localeData);


const RankTracker = () => {
   const [data, setData] = useState([]);
  const [enteredData, setEnteredData] = useState({});
  const [exitedData, setExitedData] = useState({});
  const [columns, setColumns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("entered");

  const { user } = useContext(AuthContext);
  const userRole = user?.role || "";

  const [filter, setFilter] = useState({
    keyword: "",
    url: "",
    dateRange: ["2025-11-06T18:30:00.000Z", "2025-11-07T18:30:00.000Z"],
    project: "",
    brand: "",
    category: "",
    subCategory: "",
    result_type: "",
  });
  const [projectUser, setProjectUser] = useState(filter.user);
  const [selectedProjectId, setSelectedProjectId] = useState(filter.project);

  const resultTypeOptions = [
    { key: "organic", value: "Organic" },
    { key: "paid", value: "Paid" },
    { key: "people_also_ask_expanded_element", value: "People also ask" },
    { key: "link_element", value: "Link element" },
    { key: "local_pack", value: "Local pack" },
    { key: "ai_overview_reference", value: "AI overview" },
  ];

  // 1) When user becomes available, set filter.user and projectUser
  useEffect(() => {
    if (user) {
      const userId = user?._id;
      setFilter((prev) => ({ ...prev, user: userId }));
      setProjectUser(userId);
    }
  }, [user]);

  // 2) Fetch projects once projectUser is known
  useEffect(() => {
    if (projectUser) {
      fetchProjects();
    }
  }, [projectUser]);

  const fetchProjects = async () => {
    try {
      const res = await getProjects({ user: projectUser });
      const fetched = res.data.projects || [];
      setProjects(fetched);

      // Pick a default project if none selected yet
      if (fetched.length > 0 && !selectedProjectId) {
        const defaultProjectId = fetched[0]._id;
        setFilter((prev) => ({ ...prev, project: defaultProjectId }));
        setSelectedProjectId(defaultProjectId);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  // 3) Fetch rank data whenever filter changes
  useEffect(() => {
    if (filter.project) {
      fetchRankData();
    }
  }, [filter]);

  // 4) Once a project is selected, fetch the Excel metadata
  useEffect(() => {
    if (selectedProjectId && filter.project === selectedProjectId) {
      getExcelData();
    }
  }, [selectedProjectId, filter.project]);

  const getExcelData = async () => {
    try {
      const res = await getExcel(selectedProjectId, filter);
      const metadata = res.data.metadata || {};
      const brandList = metadata.brands || [];
      const categoryList = metadata.categories || [];
      const subCategoryList = metadata.subCategories || [];

      setBrands([...new Set(brandList)]);
      setCategories([...new Set(categoryList)]);
      setSubCategories([...new Set(subCategoryList)]);
    } catch (err) {
      console.error("Error fetching Excel metadata:", err);
    }
  };

  const fetchRankData = async () => {
    try {
      const [startISO, endISO] = filter.dateRange;
      const startDate = startISO ? dayjs(startISO).format("YYYY-MM-DD") : "";
      const endDate = endISO ? dayjs(endISO).format("YYYY-MM-DD") : "";

      const filteredQuery = {
        ...(filter.keyword && { keyword: filter.keyword }),
        ...(filter.url && { url: filter.url }),
        ...(startDate && endDate && { startDate, endDate }),
        ...(filter.project && { project: filter.project }),
        ...(filter.result_type && { result_type: filter.result_type }),
        ...(filter.category && { category: filter.category }),
        ...(filter.subCategory && { subCategory: filter.subCategory }),
        ...(filter.brand && { brand: filter.brand }),
      };

      const response = await getRankTracking({
        ...filteredQuery,
        startDate,
        endDate,
      });
      const exitedResponse = await getExitRankTracking({
        ...filteredQuery,
        startDate,
        endDate,
      });

      setEnteredData(response.data || {});
      setExitedData(exitedResponse.data || {});
      generateColumns(startDate, endDate);
    } catch (err) {
      console.error("Error fetching rank data:", err);
    }
  };

  const generateColumns = (startDate, endDate) => {
    setColumns([
      { title: "Keyword", dataIndex: "keyword", key: "keyword", width: 420 },
      {
        title: `${moment(endDate).format("DD MMM, YYYY")} (End Date)`,
        dataIndex: "endRank",
        key: "endRank",
        width: 350,
      },
      {
        title: `${moment(startDate).format("DD MMM, YYYY")} (Start Date)`,
        dataIndex: "startRank",
        key: "startRank",
        width: 350,
      },
    ]);
  };

  // Card style for each rank‐group table
  const cardStyle = {
    backgroundColor: "#fff",
    borderRadius: "8px",
    marginBottom: "16px",
  };

  // Render a card containing the "Entered" group table
  const renderEnteredTable = (rankGroup, title, dataObj) => {
    if (!dataObj[rankGroup] || !dataObj[rankGroup].keywords?.length)
      return null;

    return (
      <div key={rankGroup} className="card basic-data-table" style={cardStyle}>
        <div className="card-header">
          <h5 className="card-title mb-0">{title}</h5>
        </div>
        <Table
          className="custom-table"
          rowKey="keyword"
          columns={columns}
          dataSource={dataObj[rankGroup].keywords}
          pagination={{
            pageSize: 10,
            // showSizeChanger: true,
            // hideOnSinglePage: true,
          }}
        />
      </div>
    );
  };

  // Render a card containing the "Exited" group table
  const renderExitedTable = (rankGroup, title, dataObj) => {
    if (!dataObj[rankGroup] || !dataObj[rankGroup].keywords?.length)
      return null;

    return (
      <div key={rankGroup} className="card basic-data-table" style={cardStyle}>
        <div className="card-header">
          <h5 className="card-title mb-0">{title}</h5>
        </div>
        <Table
          className="custom-table"
          rowKey="keyword"
          columns={columns}
          dataSource={dataObj[rankGroup].keywords}
          // Uncomment below if you want no pagination:
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            position: ["bottomRight"],
            style: { marginTop: 16 },
            hideOnSinglePage: true,
          }}
        />
      </div>
    );
  };

  // Build the array of "Entered" cards
  const enteredTables = [
    { rank: "Rank 1", title: "Entered in Top 1" },
    { rank: "Rank 2-3", title: "Entered in Top 3" },
    { rank: "Rank 4-5", title: "Entered in Top 5" },
    { rank: "Rank 6-10", title: "Entered in Top 10" },
  ]
    .map(({ rank, title }) => renderEnteredTable(rank, title, enteredData))
    .filter((el) => el !== null);

  // Build the array of "Exited" cards
  const exitedTables = [
    { rank: "Rank 1", title: "Exit from Top 1" },
    { rank: "Rank 2-3", title: "Exit from Top 3" },
    { rank: "Rank 4-5", title: "Exit from Top 5" },
    { rank: "Rank 6-10", title: "Exit from Top 10" },
  ]
    .map(({ rank, title }) => renderExitedTable(rank, title, exitedData))
    .filter((el) => el !== null);

  // Handle tab switching
  const handleTabClick = (tabKey) => setActiveTab(tabKey);


//this is correct way 
// const downloadExcel = () => {
//   const isEntered = activeTab === "entered";
//   const excelData = isEntered
//     ? prepareExcelDataWithDates(enteredData, "entered")
//     : prepareExcelDataWithDates(exitedData, "exited");

//   if (!excelData.length) return;

//   const worksheet = XLSX.utils.json_to_sheet(excelData);
//   const workbook = XLSX.utils.book_new();

//   XLSX.utils.book_append_sheet(
//     workbook,
//     worksheet,
//     isEntered ? "Rank Gains" : "Rank Losses"
//   );

//   XLSX.writeFile(
//     workbook,
//     `Keyword_Movement_${isEntered ? "Gains" : "Losses"}_${dayjs().format(
//       "YYYY-MM-DD"
//     )}.xlsx`
//   );
// };


// const prepareExcelData = (sourceData, type) => {
//   const rows = [];

//   const rankGroups = [
//     { key: "Rank 1", label: type === "entered" ? "Entered Top 1" : "Exit Top 1" },
//     { key: "Rank 2-3", label: type === "entered" ? "Entered Top 3" : "Exit Top 3" },
//     { key: "Rank 4-5", label: type === "entered" ? "Entered Top 5" : "Exit Top 5" },
//     { key: "Rank 6-10", label: type === "entered" ? "Entered Top 10" : "Exit Top 10" },
//   ];

//   rankGroups.forEach(({ key, label }) => {
//     const group = sourceData[key];
//     if (!group || !group.keywords?.length) return;

//     group.keywords.forEach((item) => {
//       rows.push({
//         "Rank Group": label,
//         Keyword: item.keyword,
//         "Start Rank": item.startRank,
//         "End Rank": item.endRank,
//       });
//     });
//   });

//   return rows;
// };


const downloadExcel = () => {
  const gainsData = prepareExcelDataWithDates(enteredData, "entered");
  const lossesData = prepareExcelDataWithDates(exitedData, "exited");

  // If no data at all, stop
  if (!gainsData.length && !lossesData.length) return;

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Gains
  const gainsSheet = XLSX.utils.json_to_sheet(gainsData);
  XLSX.utils.book_append_sheet(workbook, gainsSheet, "Rank Gains");

  // Sheet 2: Losses
  const lossesSheet = XLSX.utils.json_to_sheet(lossesData);
  XLSX.utils.book_append_sheet(workbook, lossesSheet, "Rank Losses");

  // Single Excel file download
  XLSX.writeFile(
    workbook,
    `Keyword_Movement_${dayjs().format("YYYY-MM-DD")}.xlsx`
  );
};



const prepareExcelDataWithDates = (sourceData, type) => {
  const rows = [];

  const rankGroups = [
    { key: "Rank 1", label: type === "entered" ? "Entered Top 1" : "Exit Top 1" },
    { key: "Rank 2-3", label: type === "entered" ? "Entered Top 3" : "Exit Top 3" },
    { key: "Rank 4-5", label: type === "entered" ? "Entered Top 5" : "Exit Top 5" },
    { key: "Rank 6-10", label: type === "entered" ? "Entered Top 10" : "Exit Top 10" },
  ];

  rankGroups.forEach(({ key, label }) => {
    const group = sourceData[key];
    if (!group?.keywords?.length) return;

    group.keywords.forEach((item) => {
      const row = {
        "Rank Group": label,
        Keyword: item.keyword,
      };

      // Add date-wise columns from table definition
      columns.forEach((col) => {
        if (col.dataIndex !== "keyword") {
          row[col.title] = item[col.dataIndex] ?? "-";
        }
      });

      rows.push(row);
    });
  });

  return rows;
};



  return (
    <div className="project-dashboard container py-4">
      <div>
        <h6 className="mt-2" style={{ color: "#4a4a4a" }}>
          Keywords Movement
        </h6>
      </div>

      {/* ───── FILTER SECTION ───── */}
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="row gy-3 gx-3 align-items-end">
            {/* Project Selector */}
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
                }}
              >
                <option value="">Select Project</option>
                {projects.map((proj) => (
                  <option key={proj._id} value={proj._id}>
                    {proj.project_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand Selector */}
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

            {/* Category Selector */}
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
                {categories?.map((c, idx) => (
                  <option key={idx} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sub-Category Selector */}
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
                {subCategories?.map((sc, idx) => (
                  <option key={idx} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>

            {/* Type Selector */}
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
                {resultTypeOptions.map((rt) => (
                  <option key={rt.key} value={rt.key}>
                    {rt.value}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date Picker */}
            <div className="col-md-5">
              <label htmlFor="startDate" className="form-label fw-semibold">
                Start Date
              </label>
              <input
                id="startDate"
                type="date"
                className="form-control"
                value={filter.dateRange[0]?.substring(0, 10) || ""}
                onChange={(e) => {
                  const newRange = [...filter.dateRange];
                  newRange[0] = e.target.value
                    ? dayjs(e.target.value).toISOString()
                    : "";
                  setFilter((prev) => ({ ...prev, dateRange: newRange }));
                }}
              />
            </div>

            {/* End Date Picker */}
            <div className="col-md-5">
              <label htmlFor="endDate" className="form-label fw-semibold">
                End Date
              </label>
              <input
                id="endDate"
                type="date"
                className="form-control"
                value={filter.dateRange[1]?.substring(0, 10) || ""}
                onChange={(e) => {
                  const newRange = [...filter.dateRange];
                  newRange[1] = e.target.value
                    ? dayjs(e.target.value).toISOString()
                    : "";
                  setFilter((prev) => ({ ...prev, dateRange: newRange }));
                }}
              />
            </div>

            {/* Reset Button */}
            <div className="col-md-3 align-items-end pt-6">
              <button
                className="btn btn-secondary w-100"
                onClick={() =>
                  setFilter({
                    keyword: "",
                    url: "",
                    dateRange: ["", ""],
                    project: "",
                    brand: "",
                    category: "",
                    subCategory: "",
                    result_type: "",
                  })
                }
              >
                Reset
              </button>

            <Button
  type="primary"
  icon={<DownloadOutlined />}
  onClick={downloadExcel}
>
  Download Excel
</Button>

      
            </div>
          </div>
        </div>
      </div>

      {/* ───── TAB SWITCHER ───── */}
      <div className="mt-80">
        <button
          onClick={() => handleTabClick("entered")}
          style={{
            padding: "8px 16px",
            marginRight: "8px",
            background: activeTab === "entered" ? "#2980b9" : "#e0e0e0",
            color: activeTab === "entered" ? "#fff" : "#333",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Rank Gains
        </button>
        <button
          onClick={() => handleTabClick("exited")}
          style={{
            padding: "8px 16px",
            background: activeTab === "exited" ? "#2980b9" : "#e0e0e0",
            color: activeTab === "exited" ? "#fff" : "#333",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Rank Losses
        </button>
      </div>

      {/* ───── TABLE CONTAINER ───── */}
      <div className="mt-20">
        {activeTab === "entered" &&
          (enteredTables.length ? (
            enteredTables
          ) : (
            <p>No data available for Rank Gains.</p>
          ))}

        {activeTab === "exited" &&
          (exitedTables.length ? (
            exitedTables
          ) : (
            <p>No data available for Rank Losses.</p>
          ))}
      </div>
    </div>
  );
};

export default RankTracker;




// ---------------------------------------------
// import React, { useContext, useEffect, useState } from "react";
// import { Button, Table } from "antd";
// import { DownloadOutlined } from "@ant-design/icons";
// import dayjs from "dayjs";
// import weekday from "dayjs/plugin/weekday";
// import localeData from "dayjs/plugin/localeData";
// import moment from "moment";
// import * as XLSX from "xlsx";

// import {
//   getRankTracking,
//   getProjects,
//   getExcel,
//   getExitRankTracking,
// } from "../../services/api";
// import AuthContext from "../../context/AuthContext";

// dayjs.extend(weekday);
// dayjs.extend(localeData);

// const RankTracker = () => {
//   const { user } = useContext(AuthContext);

//   /* ───── STATE ───── */
//   const [enteredData, setEnteredData] = useState({});
//   const [exitedData, setExitedData] = useState({});
//   const [columns, setColumns] = useState([]);
//   const [projects, setProjects] = useState([]);
//   const [brands, setBrands] = useState([]);
//   const [categories, setCategories] = useState([]);
//   const [subCategories, setSubCategories] = useState([]);
//   const [activeTab, setActiveTab] = useState("entered");

//   // USED FOR DOWNLOAD BUTTON ENABLE/DISABLE (your JSX needs this)
//   const [data, setData] = useState([]);

//   const [filter, setFilter] = useState({
//     user: "",
//     keyword: "",
//     url: "",
//     dateRange: ["", ""],
//     project: "",
//     brand: "",
//     category: "",
//     subCategory: "",
//     result_type: "",
//   });

//   const [projectUser, setProjectUser] = useState("");
//   const [selectedProjectId, setSelectedProjectId] = useState("");

//   const resultTypeOptions = [
//     { key: "organic", value: "Organic" },
//     { key: "paid", value: "Paid" },
//     { key: "people_also_ask_expanded_element", value: "People also ask" },
//     { key: "link_element", value: "Link element" },
//     { key: "local_pack", value: "Local pack" },
//     { key: "ai_overview_reference", value: "AI overview" },
//   ];

//   /* ───── USER INIT ───── */
//   useEffect(() => {
//     if (user?._id) {
//       setFilter((prev) => ({ ...prev, user: user._id }));
//       setProjectUser(user._id);
//     }
//   }, [user]);

//   /* ───── FETCH PROJECTS ───── */
//   useEffect(() => {
//     if (projectUser) fetchProjects();
//   }, [projectUser]);

//   const fetchProjects = async () => {
//     try {
//       const res = await getProjects({ user: projectUser });
//       const list = res.data.projects || [];
//       setProjects(list);

//       if (list.length && !selectedProjectId) {
//         setSelectedProjectId(list[0]._id);
//         setFilter((p) => ({ ...p, project: list[0]._id }));
//       }
//     } catch (err) {
//       console.error("Project fetch error:", err);
//     }
//   };

//   /* ───── FETCH EXCEL META ───── */
//   useEffect(() => {
//     if (selectedProjectId) fetchExcelMeta();
//   }, [selectedProjectId]);

//   const fetchExcelMeta = async () => {
//     try {
//       const res = await getExcel(selectedProjectId, filter);
//       const meta = res.data.metadata || {};
//       setBrands([...new Set(meta.brands || [])]);
//       setCategories([...new Set(meta.categories || [])]);
//       setSubCategories([...new Set(meta.subCategories || [])]);
//     } catch (err) {
//       console.error("Excel meta error:", err);
//     }
//   };

//   /* ───── FETCH RANK DATA ───── */
//   useEffect(() => {
//     if (filter.project) fetchRankData();
//   }, [filter]);

//   const fetchRankData = async () => {
//     try {
//       const [s, e] = filter.dateRange;
//       const startDate = s ? dayjs(s).format("YYYY-MM-DD") : "";
//       const endDate = e ? dayjs(e).format("YYYY-MM-DD") : "";

//       const query = {
//         ...(filter.keyword && { keyword: filter.keyword }),
//         ...(filter.url && { url: filter.url }),
//         ...(filter.project && { project: filter.project }),
//         ...(filter.brand && { brand: filter.brand }),
//         ...(filter.category && { category: filter.category }),
//         ...(filter.subCategory && { subCategory: filter.subCategory }),
//         ...(filter.result_type && { result_type: filter.result_type }),
//         ...(startDate && endDate && { startDate, endDate }),
//       };

//       const [enteredRes, exitedRes] = await Promise.all([
//         getRankTracking(query),
//         getExitRankTracking(query),
//       ]);

//       const entered = enteredRes.data || {};
//       const exited = exitedRes.data || {};

//       setEnteredData(entered);
//       setExitedData(exited);

//       // Used only to enable Download button
//       setData([
//         ...Object.values(entered || {}),
//         ...Object.values(exited || {}),
//       ]);

//       generateColumns(startDate, endDate);
//     } catch (err) {
//       console.error("Rank fetch error:", err);
//     }
//   };

//   const generateColumns = (start, end) => {
//     setColumns([
//       { title: "Keyword", dataIndex: "keyword", key: "keyword", width: 420 },
//       {
//         title: `${moment(end).format("DD MMM YYYY")} (End Date)`,
//         dataIndex: "endRank",
//       },
//       {
//         title: `${moment(start).format("DD MMM YYYY")} (Start Date)`,
//         dataIndex: "startRank",
//       },
//     ]);
//   };

//   /* ───── TABLE RENDER HELPERS ───── */
//   const renderEnteredTable = (rank, title, dataObj) => {
//     if (!dataObj[rank]?.keywords?.length) return null;
//     return (
//       <div key={rank} className="card basic-data-table mb-3">
//         <div className="card-header">
//           <h5 className="mb-0">{title}</h5>
//         </div>
//         <Table
//           rowKey="keyword"
//           columns={columns}
//           dataSource={dataObj[rank].keywords}
//           pagination={{ pageSize: 10 }}
//         />
//       </div>
//     );
//   };

//   const renderExitedTable = (rank, title, dataObj) => {
//     if (!dataObj[rank]?.keywords?.length) return null;
//     return (
//       <div key={rank} className="card basic-data-table mb-3">
//         <div className="card-header">
//           <h5 className="mb-0">{title}</h5>
//         </div>
//         <Table
//           rowKey="keyword"
//           columns={columns}
//           dataSource={dataObj[rank].keywords}
//           pagination={{ pageSize: 10 }}
//         />
//       </div>
//     );
//   };

//   const enteredTables = [
//     { rank: "Rank 1", title: "Entered in Top 1" },
//     { rank: "Rank 2-3", title: "Entered in Top 3" },
//     { rank: "Rank 4-5", title: "Entered in Top 5" },
//     { rank: "Rank 6-10", title: "Entered in Top 10" },
//   ].map((r) => renderEnteredTable(r.rank, r.title, enteredData)).filter(Boolean);

//   const exitedTables = [
//     { rank: "Rank 1", title: "Exit from Top 1" },
//     { rank: "Rank 2-3", title: "Exit from Top 3" },
//     { rank: "Rank 4-5", title: "Exit from Top 5" },
//     { rank: "Rank 6-10", title: "Exit from Top 10" },
//   ].map((r) => renderExitedTable(r.rank, r.title, exitedData)).filter(Boolean);

//   const handleTabClick = (tab) => setActiveTab(tab);

//   /* ───── EXCEL DOWNLOAD (FIXED) ───── */
//   const downloadExcel = () => {
//     const rows = [];

//     const buildRows = (dataObj, type) => {
//       Object.keys(dataObj).forEach((group) => {
//         dataObj[group]?.keywords?.forEach((k) => {
//           rows.push({
//             "Rank Type": type,
//             "Rank Group": group,
//             Keyword: k.keyword,
//             "Start Rank": k.startRank,
//             "End Rank": k.endRank,
//             "Start Date": filter.dateRange[0]
//               ? moment(filter.dateRange[0]).format("DD MMM YYYY")
//               : "",
//             "End Date": filter.dateRange[1]
//               ? moment(filter.dateRange[1]).format("DD MMM YYYY")
//               : "",
//           });
//         });
//       });
//     };

//     buildRows(enteredData, "Entered");
//     buildRows(exitedData, "Exited");

//     if (!rows.length) return;

//     const ws = XLSX.utils.json_to_sheet(rows);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Rank Movement");
//     XLSX.writeFile(wb, `Rank_Movement_${dayjs().format("YYYY-MM-DD")}.xlsx`);
//   };

//   /* ───── ORIGINAL JSX (UNCHANGED) ───── */
//   return (
//     <div className="project-dashboard container py-4">
//       <div>
//         <h6 className="mt-2" style={{ color: "#4a4a4a" }}>
//           Keywords Movement
//         </h6>
//       </div>

//       {/* ───── FILTER SECTION ───── */}
//       <div className="card shadow-sm">
//         <div className="card-body">
//           <div className="row gy-3 gx-3 align-items-end">
//             {/* Project Selector */}
//             <div className="col-md-3">
//               <label htmlFor="projectSelect" className="form-label fw-semibold">
//                 Project
//               </label>
//               <select
//                 id="projectSelect"
//                 className="form-control"
//                 value={filter.project}
//                 onChange={(e) => {
//                   const val = e.target.value;
//                   setFilter((prev) => ({ ...prev, project: val }));
//                   setSelectedProjectId(val);
//                 }}
//               >
//                 <option value="">Select Project</option>
//                 {projects.map((proj) => (
//                   <option key={proj._id} value={proj._id}>
//                     {proj.project_name}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             {/* Brand Selector */}
//             <div className="col-md-3">
//               <label htmlFor="brandSelect" className="form-label fw-semibold">
//                 Brand
//               </label>
//               <select
//                 id="brandSelect"
//                 className="form-control"
//                 value={filter.brand}
//                 onChange={(e) =>
//                   setFilter((prev) => ({ ...prev, brand: e.target.value }))
//                 }
//               >
//                 <option value="">All</option>
//                 {brands.map((b, idx) => (
//                   <option key={idx} value={b}>
//                     {b}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             {/* Category Selector */}
//             <div className="col-md-3">
//               <label
//                 htmlFor="categorySelect"
//                 className="form-label fw-semibold"
//               >
//                 Category
//               </label>
//               <select
//                 id="categorySelect"
//                 className="form-control"
//                 value={filter.category}
//                 onChange={(e) =>
//                   setFilter((prev) => ({ ...prev, category: e.target.value }))
//                 }
//               >
//                 <option value="">All</option>
//                 {categories?.map((c, idx) => (
//                   <option key={idx} value={c}>
//                     {c}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             {/* Sub-Category Selector */}
//             <div className="col-md-3">
//               <label
//                 htmlFor="subCategorySelect"
//                 className="form-label fw-semibold"
//               >
//                 Sub Category
//               </label>
//               <select
//                 id="subCategorySelect"
//                 className="form-control"
//                 value={filter.subCategory}
//                 onChange={(e) =>
//                   setFilter((prev) => ({
//                     ...prev,
//                     subCategory: e.target.value,
//                   }))
//                 }
//               >
//                 <option value="">All</option>
//                 {subCategories?.map((sc, idx) => (
//                   <option key={idx} value={sc}>
//                     {sc}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             {/* Type Selector */}
//             <div className="col-md-2">
//               <label
//                 htmlFor="resultTypeSelect"
//                 className="form-label fw-semibold"
//               >
//                 Type
//               </label>
//               <select
//                 id="resultTypeSelect"
//                 className="form-control"
//                 value={filter.result_type}
//                 onChange={(e) =>
//                   setFilter((prev) => ({
//                     ...prev,
//                     result_type: e.target.value,
//                   }))
//                 }
//               >
//                 <option value="">All</option>
//                 {resultTypeOptions.map((rt) => (
//                   <option key={rt.key} value={rt.key}>
//                     {rt.value}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             {/* Start Date Picker */}
//             <div className="col-md-5">
//               <label htmlFor="startDate" className="form-label fw-semibold">
//                 Start Date
//               </label>
//               <input
//                 id="startDate"
//                 type="date"
//                 className="form-control"
//                 value={filter.dateRange[0]?.substring(0, 10) || ""}
//                 onChange={(e) => {
//                   const newRange = [...filter.dateRange];
//                   newRange[0] = e.target.value
//                     ? dayjs(e.target.value).toISOString()
//                     : "";
//                   setFilter((prev) => ({ ...prev, dateRange: newRange }));
//                 }}
//               />
//             </div>

//             {/* End Date Picker */}
//             <div className="col-md-5">
//               <label htmlFor="endDate" className="form-label fw-semibold">
//                 End Date
//               </label>
//               <input
//                 id="endDate"
//                 type="date"
//                 className="form-control"
//                 value={filter.dateRange[1]?.substring(0, 10) || ""}
//                 onChange={(e) => {
//                   const newRange = [...filter.dateRange];
//                   newRange[1] = e.target.value
//                     ? dayjs(e.target.value).toISOString()
//                     : "";
//                   setFilter((prev) => ({ ...prev, dateRange: newRange }));
//                 }}
//               />
//             </div>

//             {/* Reset Button */}
//             <div className="col-md-3 align-items-end pt-6">
//               <button
//                 className="btn btn-secondary w-100"
//                 onClick={() =>
//                   setFilter({
//                     keyword: "",
//                     url: "",
//                     dateRange: ["", ""],
//                     project: "",
//                     brand: "",
//                     category: "",
//                     subCategory: "",
//                     result_type: "",
//                   })
//                 }
//               >
//                 Reset
//               </button>

//               <div className="d-flex justify-content-end mb-3">
//             <Button type="primary" icon={<DownloadOutlined />} onClick={downloadExcel} disabled={data.length === 0}>
//               Download Excel
//             </Button>
//           </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* ───── TAB SWITCHER ───── */}
//       <div className="mt-80">
//         <button
//           onClick={() => handleTabClick("entered")}
//           style={{
//             padding: "8px 16px",
//             marginRight: "8px",
//             background: activeTab === "entered" ? "#2980b9" : "#e0e0e0",
//             color: activeTab === "entered" ? "#fff" : "#333",
//             border: "none",
//             borderRadius: "4px",
//             cursor: "pointer",
//           }}
//         >
//           Rank Gains
//         </button>
//         <button
//           onClick={() => handleTabClick("exited")}
//           style={{
//             padding: "8px 16px",
//             background: activeTab === "exited" ? "#2980b9" : "#e0e0e0",
//             color: activeTab === "exited" ? "#fff" : "#333",
//             border: "none",
//             borderRadius: "4px",
//             cursor: "pointer",
//           }}
//         >
//           Rank Losses
//         </button>
//       </div>

//       {/* ───── TABLE CONTAINER ───── */}
//       <div className="mt-20">
//         {activeTab === "entered" &&
//           (enteredTables.length ? (
//             enteredTables
//           ) : (
//             <p>No data available for Rank Gains.</p>
//           ))}

//         {activeTab === "exited" &&
//           (exitedTables.length ? (
//             exitedTables
//           ) : (
//             <p>No data available for Rank Losses.</p>
//           ))}
//       </div>
//     </div>
//   );
// };

// export default RankTracker;
