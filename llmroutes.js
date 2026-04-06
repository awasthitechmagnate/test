const express = require("express");
const {
  getLLMProjects,
  getLLMRankings,
  exportLLMRankings,
  editProject,
  deleteProject,
  getYourMentions,
  getTotalCitations,
  getLLMCitationsAndRanks,
  getCompetitorsRankingsByDomain,
  downloadLLMRanks,
  getLLMPromptsWithUrls,
  getLLMPromptsByBrand,
  getMyPages,
  getThirdPartyPages,
  getMyPages1,
  getLLMPrompts,
  compareLLMBrandMentionsByDates,
  compareLLMMyPagesCitedByDates,
  compareLLMPagesMentioningMeByDates,
} = require("../controllers/LLMController");
const { authMiddleware } = require("../middleware/AuthMiddleware");
const router = express.Router();

router.get("/get/:slug", getLLMRankings);
router.get("/get-competitor/:slug", getCompetitorsRankingsByDomain);
router.put("/edit-project/:id", editProject);
router.delete("/delete-project/:id", deleteProject);
router.get("/get-projects", authMiddleware, getLLMProjects);
router.get("/export/:slug", exportLLMRankings);
router.get("/getCitations", getTotalCitations);
router.get("/getCitationsAndRanks", getLLMCitationsAndRanks);
router.get("/getPromptsWithUrls", getLLMPromptsWithUrls);
router.get("/getPromptsWithBrand", getLLMPromptsByBrand);
router.get("/getExcel", downloadLLMRanks);
router.get("/getMyPages/:id", getMyPages);
router.get("/getMyPages1/:id", getMyPages1);
router.get("/getThirdPartyPages", getThirdPartyPages);
router.get("/getPrompts", getLLMPrompts);
router.get("/compareBrandMentionsByDates", compareLLMBrandMentionsByDates);
router.get("/compareMyPagesCitedByDates", compareLLMMyPagesCitedByDates);
router.get("/comparePagesMentioningMeByDates", compareLLMPagesMentioningMeByDates);


module.exports = router;
