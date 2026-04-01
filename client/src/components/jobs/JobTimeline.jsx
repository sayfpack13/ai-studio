import { useEffect, useState } from "react";
import { getJobEvents } from "../../services/api";

export default function JobTimeline({ jobId }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let timer = null;
    const load = async () => {
      if (!jobId) return;
      const response = await getJobEvents(jobId);
      setEvents(response?.events || []);
    };
    load();
    timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [jobId]);

  if (!jobId) return <p className="text-xs text-gray-500">Select a job to view timeline.</p>;

  return (
    <div className="space-y-2">
      {events.map((event, idx) => (
        <div key={`${event.at}-${idx}`} className="text-xs bg-gray-800 rounded px-2 py-1">
          <span className="text-gray-400">{new Date(event.at).toLocaleTimeString()}</span>{" "}
          <span className="text-blue-300">{event.event}</span>
        </div>
      ))}
      {events.length === 0 && <p className="text-xs text-gray-500">No events yet.</p>}
    </div>
  );
}
