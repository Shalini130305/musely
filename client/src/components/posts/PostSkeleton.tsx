export function PostSkeleton() {
  // Randomize aspect ratio slightly for realistic masonry skeleton effect
  const heights = ['aspect-[3/4]', 'aspect-[4/5]', 'aspect-[1/1]', 'aspect-[2/3]'];
  const randomHeight = heights[Math.floor(Math.random() * heights.length)];

  return (
    <div className="masonry-item animate-pulse">
      <div className={`w-full ${randomHeight} bg-cream-200 dark:bg-charcoal-700 rounded-2xl mb-2`} />
      <div className="px-1 space-y-2">
        <div className="h-4 bg-cream-200 dark:bg-charcoal-700 rounded-md w-3/4" />
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-cream-200 dark:bg-charcoal-700" />
          <div className="h-3 bg-cream-200 dark:bg-charcoal-700 rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}
