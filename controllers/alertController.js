import supabase from "../config/supabaseClient.js";

/**
 * Create and store an alert
 * Used by Socket.IO
 */
export const createAlert = async (alertData) => {
  const { error } = await supabase
    .from("alerts")
    .insert([alertData]);

  if (error) {
    console.error("Supabase alert insert error:", error);
    return false;
  }

  return true;
};
