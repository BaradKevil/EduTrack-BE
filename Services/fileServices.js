import fs from 'fs';
import ErrorHandler from '../middlewares/error.js';

export const streamDownload = (filePath, res, originalName) => {
    try{
        if(!fs.existsSync(filePath)){
            throw new ErrorHandler("File not found", 404);
        }
    
        res.download(filePath, originalName, (err) => {
            if(err){
                if (!res.headersSent) {
                    return res.status(500).json({
                        success: false,
                        error: "Error downloading file",
                    });
                }
            }
        });
    } catch (error) {
        if(error instanceof ErrorHandler){
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(500).json({
            success: false,
            error: "Error Streaming File",
        });
    }
};
