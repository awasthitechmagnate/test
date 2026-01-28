import React, { useContext, useEffect, useState } from "react";
import { Modal, Button, Form, Alert, Spinner } from "react-bootstrap";
import { showToast } from "../../lib/CustomToast";
import { editUser, getLLMProjects, getProjects, getBingProjects,getAIModeProjects,getAppRankProjects,getYoutubeProjects,getLocalProjects } from "../../services/api";
import { useNavigate } from "react-router-dom";
import StateManagedSelect from "react-select";
import AuthContext from "../../context/AuthContext";

const EditUser = ({ isOpen, onClose, onSubmit, editingUser }) => {
  const navigate = useNavigate();
  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState("");
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [projectOptions, setProjectOptions] = useState([]);

  const [selectedLLMProjects, setSelectedLLMProjects] = useState([]);
  const [llmProjectOptions, setLLMProjectOptions] = useState([]);
  // ----------------------------------------------------------------
    const [AiModeProjectOptions, setAiModeProjectOptions] = useState([]);
      const [selectedAiModeProjects, setSelectedAiModeProjects] = useState([]);

        const [localRankProjectOptions, setlocalRankProjectOptions] = useState([]);
              const [selectedlocalRankProjects, setSelectedlocalRankProjects] = useState([]);

                const [appRankProjectOptions, setappRankProjectOptions] = useState([]);
                        const [selectedappRankProjects, setSelectedappRankProjects] = useState([]);


                        const [youtubeProjectOptions, setyoutubeProjectOptions] = useState([]);
                                  const [selectedyoutubeProjects, setSelectedyoutubeProjects] = useState([]);


                                                const [bingProjectOptions, setbingProjectOptions] = useState([]);
                                                  const [selectedbingProjects, setSelectedbingProjects] = useState([]);





        

    


  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(null);
  const { user } = useContext(AuthContext);
  const userId = user?._id || "";

  // Load projects once
  useEffect(() => {
    (async () => {
      try {
        const res = await getProjects();
        setProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getLLMProjects({}, userId);
        console.log(res, "res")
        setLLMProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // ---------------------bing----------------
    useEffect(() => {
    (async () => {
      try {
        const res = await getBingProjects({}, userId);
        console.log(res, "res")
        setbingProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // ------------------------aimode-----------
   useEffect(() => {
    (async () => {
      try {
        const res = await getAIModeProjects({}, userId);
        console.log(res, "res")
        setAiModeProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // -------------------------youtube----------
   useEffect(() => {
    (async () => {
      try {
        const res = await getYoutubeProjects({}, userId);
        console.log(res, "res")
        setyoutubeProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // -------------------------localrank----------------------
    useEffect(() => {
    (async () => {
      try {
        const res = await getLocalProjects({}, userId);
        console.log(res.data, "res is check")
        setlocalRankProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);


   // -------------------------Apprank----------------------
    useEffect(() => {
    (async () => {
      try {
        const res = await getAppRankProjects({}, userId);
        console.log(res, "res")
        setappRankProjectOptions(res.data.projects);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);






  useEffect(() => {
    if (editingUser) {
      setFirstName(editingUser.firstName || "");
      setLastName(editingUser.lastName || "");
      setEmail(editingUser.email || "");
      setContact(editingUser.contact || "");
      setRole(editingUser.role || "");

      console.log(editingUser, "editingUser")

      const ids = Array.isArray(editingUser.projects)
        ? editingUser.projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];

      const llmIds = Array.isArray(editingUser.llm_projects)
        ? editingUser.llm_projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];

         const bingIds = Array.isArray(editingUser.bing_projects)
        ? editingUser.bing_projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];

          const youtubeIds = Array.isArray(editingUser.youtube_projects)
        ? editingUser.youtube_projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];

          const aimodeIds = Array.isArray(editingUser.aimode_projects)
        ? editingUser.aimode_projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];



           const appRankIds = Array.isArray(editingUser.appRank_projects)
        ? editingUser.appRank_projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];

           const localRankIds = Array.isArray(editingUser.localRank_projects)
        ? editingUser.localRank_projects.map((p) => (typeof p === "string" ? p : p._id))
        : [];


      setSelectedProjects(ids);
      setSelectedLLMProjects(llmIds);
       setSelectedappRankProjects(appRankIds);
        setSelectedyoutubeProjects(youtubeIds);
         setSelectedAiModeProjects(aimodeIds);
          setSelectedbingProjects(bingIds);
           setSelectedlocalRankProjects(localRankIds);
    } else {
      setFirstName("");
      setLastName("");
      setEmail("");
      setContact("");
      setRole("");
      setSelectedProjects([]);
      setSelectedLLMProjects([]);
    }
    setError("");
  }, [editingUser, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!firstName || !lastName || !email || !contact) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    if (!/^\d{10}$/.test(contact)) {
      setError("Enter a valid 10-digit number.");
      return;
    }

    const payload = {
      firstName,
      lastName,
      email,
      contact,
      role,
      projects: selectedProjects,
      llm_projects: selectedLLMProjects,
            bing_projects: selectedbingProjects,
            youtube_projects: selectedyoutubeProjects,
            localRank_projects: selectedlocalRankProjects,
            aimode_projects: selectedAiModeProjects,
            appRank_projects: selectedappRankProjects,

    };
    try {
      setSubmitting(true);
      const res = await editUser(editingUser._id, payload);
      showToast("User updated successfully!", "success");
      onSubmit(res.data);
      onClose();

      setTimeout(() => navigate("/users"), 3000);
      window.location.reload()
    } catch (err) {
      showToast(err?.response?.data?.message || "Error occurred", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        show={isOpen}
        onHide={onClose}
        centered
        size="md" /* make modal wider */
      >
        <Form onSubmit={handleSubmit}>
          <Modal.Header
            closeButton
            className="bg-primary text-white py-1" /* smaller header padding */
          >
            <Modal.Title>Edit User</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3" controlId="firstName">
              <Form.Label>First Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter first name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="lastName">
              <Form.Label>Last Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="email">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="contact">
              <Form.Label>Mobile Number</Form.Label>
              <Form.Control
                type="tel"
                placeholder="Enter mobile number"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={10}
                disabled={submitting}
              />
            </Form.Group>{" "}
            <Form.Group className="mb-3" controlId="role">
              <Form.Label>Role</Form.Label>
              <Form.Control
                type="text"
                placeholder="Add role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                maxLength={10}
                disabled={submitting}
              />
            </Form.Group>{" "}
            <Form.Group className="mb-4" controlId="projects">

              <Form.Label>Assign Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={projectOptions.map((p) => ({
                  value: p._id,
                  label: p.project_name,
                }))}
                value={selectedProjects
                  .map((id) => {
                    const p = projectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label: p.project_name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>

            {/* ---------------------------------------------------------- */}

            <Form.Group className="mb-4" controlId="projects">
              <Form.Label>Assign LLM Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={llmProjectOptions.map((p) => ({
                  value: p._id,
                  label: p.name,
                }))}
                value={selectedLLMProjects
                  .map((id) => {
                    const p = llmProjectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label: p.name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedLLMProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>


{/* ------------------- p1*/}



  <Form.Group className="mb-4" controlId="projects">
              <Form.Label>Assign Bing Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={bingProjectOptions.map((p) => ({
                  value: p._id,
                  label: p.name,
                }))}
                value={selectedbingProjects
                  .map((id) => {
                    const p = bingProjectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label: p.name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedbingProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>

 {/* -------------------------------------------------------------------  p2          */}

  <Form.Group className="mb-4" controlId="projects">
              <Form.Label>Assign youtube Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={youtubeProjectOptions.map((p) => ({
                  value: p._id,
                  label: p.name,
                }))}
                value={selectedyoutubeProjects
                  .map((id) => {
                    const p = youtubeProjectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label: p.name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedyoutubeProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>



   {/* ----------------------------------------------------------p3          */}


     <Form.Group className="mb-4" controlId="projects">
              <Form.Label>Assign AppRanking Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={appRankProjectOptions.map((p) => ({
                  value: p._id,
                  label: p.name,
                }))}
                value={selectedappRankProjects
                  .map((id) => {
                    const p = appRankProjectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label: p.name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedappRankProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>
    {/* ---------------------------------------------------------------------- p4         */}

  <Form.Group className="mb-4" controlId="projects">
              <Form.Label>Assign AI Mode Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={AiModeProjectOptions.map((p) => ({
                  value: p._id,
                  label: p.name,
                }))}
                value={selectedAiModeProjects
                  .map((id) => {
                    const p = AiModeProjectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label: p.name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedAiModeProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>




             {/* ---------------------------------------------------------------------- p5         */}

  <Form.Group className="mb-4" controlId="projects">
              <Form.Label>Assign LocalRanking Projects</Form.Label>
              <StateManagedSelect
                isMulti
                isDisabled={submitting}
                options={localRankProjectOptions.map((p) => ({
                  value: p._id,
                  // label: p.name,
                    label: p.project_name, // ✅ correct field

                }))}
                value={selectedlocalRankProjects
                  .map((id) => {
                    const p = localRankProjectOptions.find((x) => x._id === id);
                    return p ? { value: p._id, label:  p.project_name } : null;
                  })
                  .filter(Boolean)}
                onChange={(selected) =>
                  setSelectedlocalRankProjects(selected.map((s) => s.value))
                }
              />
            </Form.Group>




            {/* ------------------------------------------------------------------- */}
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                  />{" "}
                  Saving…
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

export default EditUser;
