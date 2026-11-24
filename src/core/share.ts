// Sharing a message through WhatsApp. Opening wa.me/?text=... lets the person pick who gets it inside WhatsApp, so no phone number is
// needed, used or sent anywhere. Pure.

/** A link that opens WhatsApp with this text ready to send. */
export const whatsappLink = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;
