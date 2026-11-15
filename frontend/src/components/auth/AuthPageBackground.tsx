import fintechAuthBg from '../../assets/fintech-auth-bg.jpg';

interface AuthPageBackgroundProps {
  className?: string;
}

/**
 * Premium FinTech Authentication Page Background
 *
 * Implements the refined, professional authentication background:
 * - Dark Theme: Preserves the previous design (deep midnight #080611 base,
 *   ambient purple-700 & violet-600 blur glows, 3D perspective rings & grid)
 *   and adds ONLY the delicate constellation wireframe lines (opacity: 0.20,
 *   mix-blend-mode: screen) matching the subtle elegance of light mode login.
 * - Light Theme: Clean daylight canvas (#faf9fc) with delicate inverted violet
 *   lines (Option C: 24% opacity, multiply) and soft center vignette.
 */
export function AuthPageBackground({ className = '' }: AuthPageBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden select-none ${className}`}
    >
      {/* =========================================================================
       * DARK THEME LAYER (Active when data-theme='dark' or .dark is set)
       * Preserves previous design (glows + rings) and adds ONLY delicate lines.
       * ========================================================================= */}
      <div className="absolute inset-0 hidden dark:block bg-[#080611]">
        {/* Previous Design: Left purple ambient glow */}
        <div className="absolute -left-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-purple-700/70 opacity-25 blur-[130px]" />

        {/* Previous Design: Right violet ambient glow */}
        <div className="absolute -right-40 bottom-[-8rem] h-[30rem] w-[30rem] rounded-full bg-violet-600/70 opacity-25 blur-[130px]" />

        {/* Previous Design: Center 3D perspective rings & grid */}
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
              WebkitMaskImage: 'radial-gradient(ellipse at center, #000 0%, transparent 72%)',
              transform: 'perspective(900px) rotateX(68deg) rotateZ(-22deg)',
            }}
          />
        </div>

        {/* Added: ONLY the delicate constellation lines (same delicacy as on light mode login) */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${fintechAuthBg})`,
            filter: 'hue-rotate(50deg) saturate(1.2) brightness(1.1)',
            opacity: 0.20,
            mixBlendMode: 'screen',
          }}
        />

        {/* Center vignette to ensure card readability */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, transparent 40%, rgba(8, 6, 17, 0.6) 90%)',
          }}
        />
      </div>

      {/* =========================================================================
       * LIGHT THEME LAYER (Option C - Active by default in light mode)
       * ========================================================================= */}
      <div className="absolute inset-0 block dark:hidden bg-[#faf9fc]">
        {/* Inverted delicate violet lines image layer (Option C - 24% opacity) */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${fintechAuthBg})`,
            filter: 'invert(1) hue-rotate(225deg) saturate(1.8) contrast(1.2)',
            opacity: 0.24,
            mixBlendMode: 'multiply',
          }}
        />

        {/* Soft daylight center vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 40%, rgba(250, 249, 252, 0.6) 90%)',
          }}
        />
      </div>
    </div>
  );
}
