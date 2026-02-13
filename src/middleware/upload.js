const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { UPLOAD_LIMITS } = require('../config/constants');

// Ensure upload directories exist
const createUploadDirs = () => {
  const dirs = [
    'uploads',
    'uploads/avatars',
    'uploads/documents',
    'uploads/announcements',
    'uploads/programs'
  ];

  dirs.forEach(dir => {
    const fullPath = path.join(__dirname, '../../', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
};

createUploadDirs();

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Determine upload folder based on field name or route
    if (file.fieldname === 'avatar') {
      uploadPath += 'avatars/';
    } else if (file.fieldname === 'document' || file.fieldname === 'receipt') {
      uploadPath += 'documents/';
    } else if (file.fieldname === 'announcement_image') {
      uploadPath += 'announcements/';
    } else if (file.fieldname === 'program_image') {
      uploadPath += 'programs/';
    }

    const fullPath = path.join(__dirname, '../../', uploadPath);
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // For avatars, use user ID as filename to overwrite old avatar
    if (file.fieldname === 'avatar' && req.params.id) {
      const filename = `${req.params.id}${path.extname(file.originalname)}`;
      cb(null, filename);
    } else {
      const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    ...UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES,
    ...UPLOAD_LIMITS.ALLOWED_DOC_TYPES
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
  }
};

// Image only filter
const imageFilter = (req, file, cb) => {
  if (UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'), false);
  }
};

// Create multer instances
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE
  }
});

const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE
  }
});

// Upload middlewares
const uploadAvatar = uploadImage.single('avatar');
const uploadDocument = upload.single('document');
const uploadReceipt = upload.single('receipt');
const uploadAnnouncementImage = uploadImage.single('announcement_image');
const uploadProgramImage = uploadImage.single('program_image');
const uploadMultipleImages = uploadImage.array('images', 5);

module.exports = {
  upload,
  uploadImage,
  uploadAvatar,
  uploadDocument,
  uploadReceipt,
  uploadAnnouncementImage,
  uploadProgramImage,
  uploadMultipleImages
};

