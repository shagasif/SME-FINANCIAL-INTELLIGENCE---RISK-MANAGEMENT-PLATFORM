export function AuthPageBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute -left-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-purple-700/70 opacity-25 blur-[130px]" />
      <div className="absolute -right-40 bottom-[-8rem] h-[30rem] w-[30rem] rounded-full bg-violet-600/70 opacity-25 blur-[130px]" />
      <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 opacity-20 sm:h-[60rem] sm:w-[60rem]">
        <div
          className="absolute inset-0 rounded-full border border-violet-300/50"
          style={{ transform: 'perspective(900px) rotateX(68deg) rotateY(-22deg)' }}
        />
        <div
          className="absolute inset-5 rounded-full border border-purple-200/40"
          style={{ transform: 'perspective(900px) rotateX(68deg) rotateY(42deg)' }}
        />
        <div
          className="absolute inset-10 rounded-full"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 24px, rgba(196, 181, 253, 0.24) 24px 25px), repeating-linear-gradient(90deg, transparent 0 24px, rgba(196, 181, 253, 0.24) 24px 25px)',
            maskImage: 'radial-gradient(ellipse at center, #000 0%, transparent 72%)',
            transform: 'perspective(900px) rotateX(68deg) rotateZ(-22deg)',
          }}
        />
      </div>
    </div>
  );
}
