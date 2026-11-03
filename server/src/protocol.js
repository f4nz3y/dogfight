export const PROTOCOL_VERSION = 1;

export function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { valid: false, error: "Message must be an object" };
  }

  if (message.v !== PROTOCOL_VERSION) {
    return { valid: false, error: "Unsupported protocol version" };
  }

  switch (message.type) {
    case "join":
      if (
        typeof message.room !== "string" ||
        message.room.trim().length < 1 ||
        message.room.length > 64 ||
        typeof message.name !== "string" ||
        message.name.trim().length < 1 ||
        message.name.trim().length > 24
      ) {
        return { valid: false, error: "Invalid join message" };
      }
      return { valid: true };

    case "chat":
      if (
        typeof message.text !== "string" ||
        message.text.trim().length < 1 ||
        message.text.length > 300
      ) {
        return { valid: false, error: "Invalid chat message" };
      }
      return { valid: true };

    case "leave":
      return { valid: true };

    default:
      return { valid: false, error: "Unknown message type" };
  }
}
