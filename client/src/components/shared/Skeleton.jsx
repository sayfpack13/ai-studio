export default function Skeleton({ className = "", variant = "text" }) {
  const variants = {
    text: "h-4 rounded",
    title: "h-6 rounded",
    avatar: "rounded-full",
    button: "h-10 rounded-lg",
    card: "h-32 rounded-lg",
    image: "rounded-lg aspect-video",
  };

  return (
    <div
      className={`
        animate-pulse bg-gray-800
        ${variants[variant]}
        ${className}
      `}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`p-4 bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      <Skeleton variant="title" className="w-1/3 mb-4" />
      <SkeletonText lines={2} />
    </div>
  );
}
