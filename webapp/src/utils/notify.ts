import toast from "react-hot-toast";

/**
 * Extracts a human-readable message from a caught error object (like an Axios error or standard Error).
 */
function getErrorMessage(error: unknown, fallback = "An unexpected error occurred"): string {
  if (!error) return fallback;

  if (typeof error === "string") return error;

  if (typeof error === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errObj = error as any;
    // Axios/Fetch response errors
    if (errObj.response?.data) {
      if (typeof errObj.response.data === "string") {
        return errObj.response.data;
      }
      if (errObj.response.data.error) {
        return typeof errObj.response.data.error === "string"
          ? errObj.response.data.error
          : errObj.response.data.error.message || fallback;
      }
      if (errObj.response.data.message) {
        return errObj.response.data.message;
      }
    }

    // Standard JS Error or custom error
    if (errObj instanceof Error) {
      return errObj.message;
    }
    
    if (errObj.message) {
      return errObj.message;
    }
  }

  return fallback;
}

export const notify = {
  success: (message: string) => {
    return toast.success(message);
  },
  error: (error: unknown, fallbackMessage?: string) => {
    const message = getErrorMessage(error, fallbackMessage);
    return toast.error(message);
  },
  warning: (message: string) => {
    // Standard react-hot-toast doesn't have a warning state, but we can make it visually distinct
    // or use custom emoji/styling
    return toast(message, {
      icon: "⚠️",
    });
  },
  info: (message: string) => {
    return toast(message, {
      icon: "ℹ️",
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custom: (message: string, options?: any) => {
    return toast(message, options);
  },
};

