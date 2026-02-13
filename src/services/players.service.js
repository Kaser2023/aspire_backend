const { Player } = require('../models');
const fs = require('fs');
const path = require('path');
const { AppError } = require('../middleware/errorHandler');

/**
 * Players Service
 * Handles player-related operations including file uploads
 */
const playersService = {
  /**
   * Upload player photo/avatar
   * @param {string} playerId - Player ID
   * @param {object} file - Uploaded file object from multer
   * @returns {Promise<object>} Updated player data
   */
  async uploadPhoto(playerId, file) {
    try {
      console.log('🔍 uploadPhoto called for player:', playerId, 'file:', file.originalname);
      const player = await Player.findByPk(playerId);
      if (!player) {
        throw new AppError('Player not found', 404);
      }

      // Create uploads directory if it doesn't exist
      // Path: backend/uploads/players/ (must match Express static serving root)
      const uploadsDir = path.join(__dirname, '../../uploads/players');
      console.log('📁 Uploads directory:', uploadsDir);
      if (!fs.existsSync(uploadsDir)) {
        console.log('📁 Creating uploads directory');
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Generate unique filename
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${playerId}_avatar_${Date.now()}.${fileExtension}`;
      const filePath = path.join(uploadsDir, fileName);
      console.log('💾 Saving file to:', filePath);

      // Write file to disk
      fs.writeFileSync(filePath, file.buffer);

      // Update player record with file path
      const avatarUrl = `/uploads/players/${fileName}`;
      console.log('🖼️ Avatar URL:', avatarUrl);
      await player.update({ avatar: avatarUrl });

      const result = {
        success: true,
        message: 'Photo uploaded successfully',
        data: { avatar: avatarUrl }
      };
      console.log('✅ Photo upload result:', result);
      return result;
    } catch (error) {
      console.error('Error uploading player photo:', error);
      throw new AppError('Failed to upload photo', 500);
    }
  },

  /**
   * Upload player ID document
   * @param {string} playerId - Player ID
   * @param {object} file - Uploaded file object from multer
   * @returns {Promise<object>} Updated player data
   */
  async uploadIdDocument(playerId, file) {
    try {
      const player = await Player.findByPk(playerId);
      if (!player) {
        throw new AppError('Player not found', 404);
      }

      // Create uploads directory if it doesn't exist
      // Path: backend/uploads/players/documents/ (must match Express static serving root)
      const uploadsDir = path.join(__dirname, '../../uploads/players/documents');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Generate unique filename
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${playerId}_id_${Date.now()}.${fileExtension}`;
      const filePath = path.join(uploadsDir, fileName);

      // Write file to disk
      fs.writeFileSync(filePath, file.buffer);

      // Update player record with file path
      const idDocumentUrl = `/uploads/players/documents/${fileName}`;
      await player.update({ id_document: idDocumentUrl });

      return {
        success: true,
        message: 'ID document uploaded successfully',
        data: { id_document: idDocumentUrl }
      };
    } catch (error) {
      console.error('Error uploading ID document:', error);
      throw new AppError('Failed to upload ID document', 500);
    }
  }
};

module.exports = playersService;
