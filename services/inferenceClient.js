import axios from "axios";

export async function callInference(payload) {
  const response = await axios.post(
    `${process.env.INFERENCE_SERVICE_URL}/predict`,
    payload,
    {
      timeout: 90000,
      headers: { "Content-Type": "application/json" },
    }
  );

  return response.data;
}
