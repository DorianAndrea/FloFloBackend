const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "floflo",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],

    transformation: [
      {
        width: 1920,
        height: 1920,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
      },
    ],
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Formato de imagen no permitido. Usa JPG, PNG o WEBP.",
        ),
      );
    }

    return callback(null, true);
  },
});

module.exports = upload;