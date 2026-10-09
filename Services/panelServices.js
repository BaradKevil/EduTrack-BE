import { Panel } from "../models/panel.js";
import User from "../models/user.js";
import ErrorHandler from "../middlewares/error.js";
import { Project } from "../models/project.js";
import { Deadline } from "../models/deadline.js";
import fs from "fs";

const removeProjectAssets = async (projects) => {
  const projectIds = projects.map((p) => p._id);

  for (const project of projects) {
    for (const file of project.files || []) {
      const filePath = file?.fileUrl;
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Keep cleanup resilient even if a file cannot be removed.
        }
      }
    }
  }

  if (projectIds.length > 0) {
    await Deadline.deleteMany({ project: { $in: projectIds } });
    await Project.deleteMany({ _id: { $in: projectIds } });
  }
};

export const createPanel = async (panelData) => {
  // Check if panel name already exists
    const existingPanel = await Panel.findOne({ panelName: panelData.panelName });
    if (existingPanel) {
    throw new ErrorHandler(`Panel "${panelData.panelName}" already exists`, 400);
    }

  // Check if any teacher is already assigned to a panel
    const alreadyAssigned = await User.find({
    _id: { $in: panelData.teachers },
    panel: { $ne: null },
    });

    if (alreadyAssigned.length > 0) {
    const names = alreadyAssigned.map((t) => t.name).join(", ");
    throw new ErrorHandler(
        `${names} already assigned to a panel`,
        400
    );
    }

  // Create the panel
    const panel = new Panel(panelData);
    await panel.save();

  // Update each teacher's panel field
    await User.updateMany(
    { _id: { $in: panelData.teachers } },
    { $set: { panel: panel._id } }
    );

    return panel;
};

export const getAllPanels = async () => {
    return await Panel.find()
    .populate("teachers", "name email department expertise")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 });
};

export const getPanelById = async (id) => {
    const panel = await Panel.findById(id)
    .populate("teachers", "name email department expertise")
    .populate("createdBy", "name email");

    if (!panel) {
    throw new ErrorHandler("Panel not found", 404);
    }
    return panel;
};

export const deletePanel = async (id) => {
    const panel = await Panel.findById(id);
    if (!panel) {
    throw new ErrorHandler("Panel not found", 404);
    }

    const studentsInPanel = await User.find({
      role: "Student",
      panel: panel._id,
    }).select("_id project");

    const studentIds = studentsInPanel.map((s) => s._id);

    const projectsToDelete = await Project.find({
      $or: [
        { panel: panel._id },
        { student: { $in: studentIds } },
      ],
    }).select("_id files");

    await removeProjectAssets(projectsToDelete);

    if (studentIds.length > 0) {
      await User.updateMany(
        { _id: { $in: studentIds } },
        { $set: { panel: null, project: null } }
      );
    }

    await User.updateMany(
    { _id: { $in: panel.teachers } },
    { $set: { panel: null } }
    );

    await Panel.findByIdAndDelete(id);

    // Strong consistency cleanup: if any student no longer belongs to a valid panel,
    // remove their linked project data to avoid stale approved/completed rows.
    const validPanelIds = await Panel.distinct("_id");
    const orphanStudents = await User.find({
      role: "Student",
      $or: [
        { panel: null },
        { panel: { $exists: false } },
        { panel: { $nin: validPanelIds } },
      ],
    }).select("_id");

    const orphanStudentIds = orphanStudents.map((s) => s._id);
    if (orphanStudentIds.length > 0) {
      const orphanProjects = await Project.find({
        student: { $in: orphanStudentIds },
      }).select("_id files");

      await removeProjectAssets(orphanProjects);

      await User.updateMany(
        { _id: { $in: orphanStudentIds } },
        { $set: { project: null } }
      );
    }

    return panel;
};