const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
let expo = new Expo();

/**
 * Send a push notification to a specific user
 * @param {string} pushToken - The recipient's Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
const sendNotification = async (pushToken, title, body, data = {}) => {
  // Check that all your push tokens appear to be valid Expo push tokens
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  // Construct the message
  const message = {
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    // Add haptic feedback hint (though usually handled on client side)
    _displayInForeground: true,
  };

  try {
    const ticketChunk = await expo.sendPushNotificationsAsync([message]);
    console.log('Notification sent successfully:', ticketChunk);
    return ticketChunk;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

module.exports = { sendNotification };
