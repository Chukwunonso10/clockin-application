import webpush from "web-push";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

let isVapidConfigured = false;

// Configure VAPID details safely, preventing startup crashes from placeholders
if (
  vapidPublicKey && 
  vapidPrivateKey && 
  !vapidPublicKey.includes("...") && 
  !vapidPrivateKey.includes("YOUR_PRIVATE_KEY_HERE")
) {
  try {
    webpush.setVapidDetails(
      "mailto:admin@enterprise-clockin.com",
      vapidPublicKey,
      vapidPrivateKey
    );
    isVapidConfigured = true;
  } catch (error) {
    console.error("Failed to configure Web-Push VAPID details:", error);
  }
} else {
  console.warn("Web-Push VAPID keys are using default placeholder values. Push notifications will be disabled.");
}

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

/**
 * Sends a push notification to a user's subscription via the web-push protocol.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: any }> {
  if (!isVapidConfigured) {
    console.warn("VAPID keys are not configured or invalid. Skipping push notification.");
    return { success: false, error: "VAPID keys are missing or invalid" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/icon-192x192.png",
        url: payload.url || "/",
      })
    );
    return { success: true };
  } catch (error) {
    console.error("Error sending push notification:", error);
    return { success: false, error };
  }
}
