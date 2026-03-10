import axios from "axios";

const INFERENCE_URL = process.env.INFERENCE_SERVICE_URL;

export default function startInferenceKeepAlive() {
  async function ping() {
    try {
      const res = await axios.get(`${INFERENCE_URL}/health`);
      console.log("AI server alive:", res.data.status);
    } catch (err) {
      console.log("AI keepalive failed:", err.message);
    }
  }

  // 🔹 Ping immediately when backend starts
  ping();

  // 🔹 Then keep it alive every 5 minutes
  setInterval(ping, 5 * 60 * 1000);
}
