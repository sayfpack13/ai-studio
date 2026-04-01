import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useEffect, useState } from "react";
import { getJobs } from "../services/api";
import JobTimeline from "./jobs/JobTimeline";

export default function Dashboard() {
  const {
    getChatIds,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
    getEditorProjectIds,
  } = useApp();
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");

  useEffect(() => {
    let timer = null;
    const load = async () => {
      const response = await getJobs({ limit: 20, allUsers: true });
      const items = response?.items || [];
      setJobs(items);
      if (!selectedJobId && items[0]?.id) {
        setSelectedJobId(items[0].id);
      }
    };
    load();
    timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [selectedJobId]);

  const cards = [
    { title: "Chat", count: getChatIds().length, to: "/" },
    { title: "Image", count: getImageIds().length, to: "/image" },
    { title: "Video", count: getVideoIds().length, to: "/video" },
    { title: "Music", count: getMusicIds().length, to: "/music" },
    { title: "Remix", count: getRemixIds().length, to: "/remix" },
    { title: "Editor Projects", count: getEditorProjectIds().length, to: "/editor" },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold">AI Studio Dashboard</h2>
        <p className="text-sm text-gray-400">Manage generation tools and editor projects.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.title} to={card.to} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-blue-500 transition-colors">
            <p className="text-sm text-gray-400">{card.title}</p>
            <p className="text-2xl font-semibold">{card.count}</p>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Recent Jobs</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={`w-full text-left p-2 rounded text-sm ${selectedJobId === job.id ? "bg-blue-700/40" : "bg-gray-800"}`}
              >
                {job.type} - {job.status} ({job.progress}%)
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Job Timeline</h3>
          <JobTimeline jobId={selectedJobId} />
        </div>
      </div>
    </div>
  );
}
