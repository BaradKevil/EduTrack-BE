import { asyncHandler } from "../middlewares/asyncHandler.js";
import * as projectServices from "../Services/projectServices.js";
import * as fileServices from "../Services/fileServices.js";
import ErrorHandler from "../middlewares/error.js";


export const downloadFile = asyncHandler(async(req,res,next) => {
    const {projectId, fileId} = req.params;
    const user = req.user;

    const project = await projectServices.getProjectById(projectId);
    if(!project) return next(new ErrorHandler("Project not found", 404));

    const userRole = (user.role || "").toLowerCase();
    const userId = user._id?.toString() || user.id;
    const hasAccess = userRole === "admin" || 
        project.student._id.toString() === userId ||
        (project.panel && project.panel._id.toString() === userId);

    if(!hasAccess){
        return next(new ErrorHandler("Not authorized to download files for this project", 403)); 
    }

    const file = project.files.id(fileId);
    if(!file) return next(new ErrorHandler("File not found", 404));

    fileServices.streamDownload(file.fileUrl, res, file.originalName);

});
