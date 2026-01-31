const AIMode = require("../models/AIMode");
const AppRanking = require("../models/AppRanking");
const Bing = require("../models/Bing");
const LLM = require("../models/LLM");
const LocalProject = require("../models/LocalProject");
const Project = require("../models/Project");
const User = require("../models/User");
const Youtube = require("../models/Youtube");

// Get Authenticated User

// / Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const user = await User.find({
      isActive: true,
      isDelete: false,
      role: "user",
    }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ data: user });
  } catch (error) {
    console.log(error, "error");
  }
};

exports.getUser = async (req, res) => {
  try {
    let query = { isDelete: false };

    let { filters } = req.query;

    // Safely parse filters to avoid crashing
    try {
      filters = filters ? JSON.parse(filters) : {};
    } catch (err) {
      return res.status(400).json({ message: "Invalid filters format" });
    }

    // Apply filters if they exist
    if (filters.name) {
      query.$or = [
        { firstName: { $regex: filters.name, $options: "i" } },
        { lastName: { $regex: filters.name, $options: "i" } },
      ];
    }

    if (filters.email) {
      query.email = { $regex: filters.email, $options: "i" };
    }

    if (filters.startDate && filters.endDate) {
      query.created_at = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    // Fetch users based on query
    const users = await User.find(query)
      .select("-password")
      .sort({ created_at: -1 });

    res.status(200).json({
      message: "Users fetched successfully",
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.addUser = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, projects } = req.body;

    if (!firstName || !lastName || !email || !mobile) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User already exists with this email" });
    }

    // Create new user with projects
    const newUser = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      contact: mobile.trim(),
      password: 1234,
      isActive: true,
      isDelete: false,
      role: "user",
      projects, // ✅ directly set projects here
    });

    // Update projects to include this user
    await Project.updateMany(
      { _id: { $in: projects } },
      { $addToSet: { users: newUser._id } }
    );

    res.status(201).json({
      message: "User created successfully",
      data: newUser,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.editUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { firstName, lastName, email, contact, projects, role, llm_projects, bing_projects,aimode_projects, appRank_projects,youtube_projects,localRank_projects } = req.body;

    if (!firstName || !lastName || !email || !contact || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for email uniqueness if the email is changed
    if (email.toLowerCase().trim() !== user.email.toLowerCase()) {
      const existingUser = await User.findOne({
        email: email.toLowerCase().trim(),
      });

      if (existingUser) {
        return res
          .status(409)
          .json({ message: "Another user already exists with this email" });
      }
    }

    // Update user fields
    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.email = email.toLowerCase().trim();
    user.contact = contact.trim();
    user.role = role.trim();
    user.projects = projects;
    user.llm_projects = llm_projects;
        user.bing_projects = bing_projects;
        user.aimode_projects=aimode_projects
        user.appRank_projects= appRank_projects
        user.youtube_projects=youtube_projects
        user.localRank_projects=localRank_projects

    await user.save();

    res.status(200).json({
      message: "User updated successfully",
      data: user,
    });

    await Project.updateMany(
      { _id: { $in: projects } },
      { $addToSet: { users: user._id } }
    );

    await Project.updateMany(
      { users: user._id, _id: { $nin: projects } },
      { $pull: { users: user._id } }
    );

    await LLM.updateMany(
      { users: user._id, _id: { $nin: llm_projects } },
      { $pull: { users: user._id } }
    );

    await LLM.updateMany(
      { _id: { $in: llm_projects } },
      { $addToSet: { users: user._id } }
    );

    // ----------------------------------------------
    await Bing.updateMany(
      { users: user._id, _id: { $nin: bing_projects } },
      { $pull: { users: user._id } }
    );

    await Bing.updateMany(
      { _id: { $in: bing_projects } },
      { $addToSet: { users: user._id } }
    );

     // ----------------------------------------------
    await Youtube.updateMany(
      { users: user._id, _id: { $nin: youtube_projects } },
      { $pull: { users: user._id } }
    );

    await Youtube.updateMany(
      { _id: { $in: youtube_projects } },
      { $addToSet: { users: user._id } }
    );


        // ----------------------------------------------
    await LocalProject.updateMany(
      { users: user._id, _id: { $nin: localRank_projects } },
      { $pull: { users: user._id } }
    );

    await LocalProject.updateMany(
      { _id: { $in: localRank_projects } },
      { $addToSet: { users: user._id } }
    );
     // ----------------------------------------------
    await AIMode.updateMany(
      { users: user._id, _id: { $nin:  aimode_projects} },
      { $pull: { users: user._id } }
    );

    await AIMode.updateMany(
      { _id: { $in:  aimode_projects } },
      { $addToSet: { users: user._id } }
    );

    //   // ----------------------------------------------
    await AppRanking.updateMany(
      { users: user._id, _id: { $nin:  appRank_projects} },
      { $pull: { users: user._id } }
    );

    await AppRanking.updateMany(
      { _id: { $in:  appRank_projects } },
      { $addToSet: { users: user._id } }
    );


    








  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user fields
    user.isDelete = true;

    await user.save();

    res.status(200).json({
      message: "User deleted successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user fields
    user.isActive = !user.isActive;

    await user.save();

    let msg = user.isActive ? "unblocked" : "blocked";

    res.status(200).json({
      message: `User ${msg} successfully`,
      data: user,
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
