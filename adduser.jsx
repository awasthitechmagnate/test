import React, { useEffect, useState } from "react";
import { Modal, Form, Input, Button, Card, Select, Spin } from "antd";
import { showToast } from "../../lib/CustomToast";
import { addInternalUser, addUser, getProjects,         getLLMProjects, getBingProjects,getAIModeProjects,getAppRankProjects,getYoutubeProjects,getLocalProjects } from "../../services/api";
import { useNavigate } from "react-router-dom";
import { GlobalOutlined } from "@ant-design/icons";
import ProjectsMultiSelect from "./ProjectMultiSelect";

const UserFormModal = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  //  const [bing_projects, setbing_Projects] = useState([]); // it will appear in mongodb
    const [bingprojects, setBingProjects] = useState([]);
     const [youtubeprojects, setYoutubeProjects] = useState([]);
                const [AIModeprojects, setAiModeProjects] = useState([]);
                const [appprojects, setAppProjects] = useState([]);
                const [localprojects, setLocalProjects] = useState([]);



        








  

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile_number: "",
    Role: "",
    projects:[],
    assign_projects: [],// this is working
    bing_projects:[],
    aimode_projects:[],
    appRank_projects:[],
    localRank_projects:[],
    llm_projects:[],
    youtube_projects:[]


  });

  const handleFinish = async (e) => {
    e.preventDefault();
    try {
      // const createUser = addUser(values);
      console.log(formData, "formData")
      await addInternalUser(formData);
      showToast("User has been created successfully!", "success");
      // setTimeout(() => navigate("/users"), [3000]);
    } catch (error) {
      showToast(`${error}`, "error");
    }
    // form.resetFields();
  };

  // useEffect(() => {
  //   async function fetchData() {
  //     const response = await getProjects();
  //     const allProjects = response.data.projects;
  //     setProjects(allProjects);
  //     const projectOptions = allProjects.map((item) => ({
  //       value: item._id,
  //       label: item.project_name,
  //     }));
  //     setProjects(projectOptions);
  //   }

  //   fetchData();
  // }, []);



  // ------------------------------getProject-------------------------------

  useEffect(() => {
    async function fetchData() {
      const response = await getProjects();
      const allProjects = response.data.projects;
      // setProjects(allProjects);
      const projectOptions = allProjects.map((item) => ({
        value: item._id,
        label: item.project_name,
      }));
      setProjects(projectOptions);
    }

    fetchData();
  }, []);

  // ----------------------------getBingProjects--------------------------------------------
    useEffect(() => {
    async function fetchData() {
      const response = await getBingProjects();
      console.log(response.data.projects, "awasthi ai bing")
      const allProjects = response.data.projects;
      // setProjects(allProjects);
      const projectOptions = allProjects.map((item) => ({
        value: item._id,
        label: item.name,
      }));
      setBingProjects(projectOptions);
    }

    fetchData();
  }, []);
  // ----------------------------------------------------------------------------------------------


   // ----------------------------getYoutubeProjects--------------------------------------------
    useEffect(() => {
    async function fetchData() {
      const response = await getYoutubeProjects();
      console.log(response.data.projects, "awasthi ai youtube")
      const allProjects = response.data.projects;
      // setProjects(allProjects);
      const projectOptions = allProjects.map((item) => ({
        value: item._id,
        label: item.name,
      }));
      setYoutubeProjects(projectOptions);
    }

    fetchData();
  }, []);



   // ----------------------------getaimode--------------------------------------------
    useEffect(() => {
    async function fetchData() {
      const response = await getAIModeProjects();
      console.log(response.data.projects, "awasthi ai mode")
      const allProjects = response.data.projects;
      // setProjects(allProjects);
      const projectOptions = allProjects.map((item) => ({
        value: item._id,
        label: item.name,
      }));
      setAiModeProjects(projectOptions);
    }

    fetchData();
  }, []);



   // ----------------------------getlocalranking--------------------------------------------
    useEffect(() => {
    async function fetchData() {
      const response = await getLocalProjects();
      console.log(response.data.projects, "awasthi ai localproject")
      const allProjects = response.data.projects;
      // setProjects(allProjects);
      const projectOptions = allProjects.map((item) => ({
        value: item._id,
        label: item.project_name,
      }));
      setLocalProjects(projectOptions);
    }

    fetchData();
  }, []);




  
   // ----------------------------getappranking--------------------------------------------
    useEffect(() => {
    async function fetchData() {
      const response = await getAppRankProjects();
      console.log(response.data.projects, "awasthi ai app")
      const allProjects = response.data.projects;
      // setProjects(allProjects);
      const projectOptions = allProjects.map((item) => ({
        value: item._id,
        label: item.name,
      }));
      setAppProjects(projectOptions);
    }

    fetchData();
  }, []);












  return (
    <div className="col-md-12 p-10">
      <div className="card">
        <div className="card-header">
          <h6 className="card-title mb-0">Add User</h6>
        </div>
        <div className="card-body">
          <form onSubmit={handleFinish}>
            <div className="row gy-3">
              <div className="col-6">
                <label htmlFor="first_name" className="form-label">
                  First Name
                </label>
                <input
                  id="first_name"
                  placeholder="Enter first name"
                  name="first_name"
                  type="text"
                  className="form-control"
                  value={formData?.first_name}
                  onChange={(e) =>
                    setFormData({ ...formData, first_name: e.target.value })
                  }
                />
              </div>

              <div className="col-6">
                <label htmlFor="last_name" className="form-label">
                  Last Name
                </label>
                <input
                  id="last_name"
                  placeholder="Enter last name"
                  name="last_name"
                  type="text"
                  className="form-control"
                  value={formData?.last_name}
                  onChange={(e) =>
                    setFormData({ ...formData, last_name: e.target.value })
                  }
                />
              </div>

              <div className="col-6">
                <label htmlFor="email" className="form-label">
                  Email
                </label>
                <input
                  id="email"
                  placeholder="Enter email"
                  name="email"
                  type="text"
                  className="form-control"
                  value={formData?.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div className="col-6">
                <label htmlFor="mobile_number" className="form-label">
                  Mobile Number
                </label>
                <input
                  id="mobile_number"
                  placeholder="Enter mobile number"
                  name="mobile_number"
                  type="tel"
                  className="form-control"
                  value={formData?.mobile_number}
                  onChange={(e) =>
                    setFormData({ ...formData, mobile_number: e.target.value })
                  }
                />
              </div>



               <div className="col-6">
                <label htmlFor="Role" className="form-label">
                  Role
                </label>
                <input
                  id="Role"
                  placeholder="Enter Role"
                  name="Role"
                  type="text"
                  className="form-control"
                  value={formData?.Role}
                  onChange={(e) =>
                    setFormData({ ...formData, Role: e.target.value })
                  }
                />
              </div>



{/* --------------------------------------project----------------------------------------------------- */}
              <div className="col-12">
                <label htmlFor="assign_projects" className="form-label">
                  Assign Projects
                </label>
                {/* Custom multi‐select dropdown */}
                <ProjectsMultiSelect
                  options={projects}
                  selectedValues={formData.assign_projects}
                  onChange={(vals) =>
                    setFormData((prev) => ({
                      ...prev,
                      assign_projects: vals,
                    }))
                  }
                // disabled={loading}
                />
              </div>



  {/* ---------------------------------Bing Project------------------------------------ */}

 <div className="col-12">
                <label htmlFor="assign_projects" className="form-label">
                  Assign bing Projects
                </label>
                {/* Custom multi‐select dropdown */}
                <ProjectsMultiSelect
                  options={bingprojects}
                  selectedValues={formData.bing_projects}
                  onChange={(vals) =>
                    setFormData((prev) => ({
                      ...prev,
                      bing_projects: vals,
                    }))
                  }
                // disabled={loading}
                />
              </div>



  {/* -----------------------------------------youtube------------------------------------------------ */}

 <div className="col-12">
                <label htmlFor="assign_projects" className="form-label">
                  Assign youtube Projects
                </label>
                {/* Custom multi‐select dropdown */}
                <ProjectsMultiSelect
                  options={youtubeprojects}
                  selectedValues={formData.youtube_projects
}
                  onChange={(vals) =>
                    setFormData((prev) => ({
                      ...prev,
                      youtube_projects: vals,
                    }))
                  }
                // disabled={loading}
                />
              </div>


   {/* ------------------------------------------------------------------------------------------            */}




  {/* ---------------------------------Ai ModeProject------------------------------------ */}

 <div className="col-12">
                <label htmlFor="assign_projects" className="form-label">
                  Assign Aimode Projects
                </label>
                {/* Custom multi‐select dropdown */}
                <ProjectsMultiSelect
                  options={AIModeprojects}
                  selectedValues={formData.aimode_projects}
                  onChange={(vals) =>
                    setFormData((prev) => ({
                      ...prev,
                      aimode_projects: vals,
                    }))
                  }
                // disabled={loading}
                />
              </div>



  {/* ---------------------------------------App Ranking-------------------------------------------------- */}

 <div className="col-12">
                <label htmlFor="assign_projects" className="form-label">
                  Assign App ranking Projects
                </label>
                {/* Custom multi‐select dropdown */}
                <ProjectsMultiSelect
                  options={appprojects}
                  selectedValues={formData.appRank_projects
}
                  onChange={(vals) =>
                    setFormData((prev) => ({
                      ...prev,
                      appRank_projects: vals,
                    }))
                  }
                // disabled={loading}
                />
              </div>


   {/* ---------------------------------------Local ranking ---------------------------------------------------            */}



 <div className="col-12">
                <label htmlFor="assign_projects" className="form-label">
                  Assign Local ranking Projects
                </label>
                {/* Custom multi‐select dropdown */}
                <ProjectsMultiSelect
                  options={localprojects}
                  selectedValues={formData.localRank_projects}
                  onChange={(vals) =>
                    setFormData((prev) => ({
                      ...prev,
                      localRank_projects: vals,
                    }))
                  }
                // disabled={loading}
                />
              </div>












              <div className="col-12">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-100"
                >
                  {loading ? (
                    <>
                      <Spin size="small" /> Creating User...
                    </>
                  ) : (
                    <>
                      <GlobalOutlined /> Submit
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserFormModal;
