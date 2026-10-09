import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { text } from "stream/consumers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); 


const ensureDirExists = (dir) => {
    if(!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
};


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath;

        if(req.route.path.includes("/upload/:projectId")){
            uploadPath = path.join(
                __dirname,
                "../uploads/projects",
                req.params.projectId
            );
        }else if(req.route.path.includes("/upload/:userId")){
            uploadPath = path.join(__dirname, "../uploads/users", req.params.userId);
        }
        else{
            uploadPath = path.join(__dirname, "../uploads/temp"); 
        }


        ensureDirExists(uploadPath);
        cb(null, uploadPath);
    },

    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`); 
    },
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
        "image/jpeg", 
        "image/png",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/plain",
        "application/zip",
        "application/x-iso9660-image",
        "image/gif",
        "application/javascript",
        "application/json",
        "text/csv",
        "text/html",
        "application/xml",
        "application/x-shockwave-flash",
        "text/css",
    ];

    const allowedExtensions = [
        ".pdf",
        ".doc",
        ".docx",
        ".jpg",
        ".jpeg",
        ".png",
        ".ppt",
        ".pptx",
        ".xls",
        ".xlsx",
        ".txt",
        ".zip",
        ".iso",
        ".gif",
        ".js",
        ".json",
        ".csv",
        ".html",
        ".xml",
        ".swf",
        ".css",
    ];

    const fileExit = path.extname(file.originalname).toLowerCase();

    if(allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExit) ){  
        cb(null, true);
    }else{
        cb(new Error("Invalid file type. Only PDF, Word, JPEG, and PNG files are allowed."), false);
    } 
} 

const upload = multer({
    storage,
    fileFilter,
    limits: { 
        fileSize: 10 * 1024 * 1024,
        files:10,
        },
    }); 


    const handleUploadError = (err, req, res, next) => {
        if(err instanceof multer.MulterError){
            if(err.code === "LIMIT_FILE_SIZE"){
                return res.status(400).json({
                    success: false,
                    message: "File is too large. Maximum size is 10MB.",
                });
            }

            if(err.code === "LIMIT_FILE_COUNT"){
                return res.status(400).json({
                    success: false,
                    message: "Too many files. Maximum 10 files allowed.",
                });
            }

            if(err.message && err.message.includes("Invalid file type")){   
                return res.status(400).json({
                    success: false,
                    message: err.message,
                });
            }
        }
        next(err); 
    }

export { upload, handleUploadError }; 