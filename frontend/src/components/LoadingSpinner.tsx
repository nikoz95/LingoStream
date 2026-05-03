interface LoadingSpinnerProps {
  message?: string;
  light?: boolean;
  inline?: boolean;
}

export default function LoadingSpinner({ message, light, inline }: LoadingSpinnerProps) {
  const wrapper = inline
    ? 'flex items-center justify-center gap-2'
    : 'flex flex-col items-center gap-3';

  const border = light ? 'border-sepia-bg/30' : 'border-current/30';
  const top = light ? 'border-t-sepia-bg' : 'border-t-current';

  return (
    <div className={wrapper}>
      <div className={`w-5 h-5 border-2 ${border} ${top} rounded-full animate-spin`} />
      {message && <p className="text-sm opacity-60">{message}</p>}
    </div>
  );
}