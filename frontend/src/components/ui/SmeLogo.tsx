import React, { useId, useState, useEffect } from 'react';

export interface SmeLogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: 'full' | 'square' | 'mark';
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  title?: string;
}

export const SmeLogo: React.FC<SmeLogoProps> = ({
  variant = 'full',
  theme = 'auto',
  className = 'h-[29.5px] w-auto',
  title = 'Financial Intel - Clarity & Risk Platform',
  ...props
}) => {
  const idPrefix = useId().replace(/:/g, '_');
  const isSquare = variant === 'square' || variant === 'mark';

  // Theme detection
  const [detectedDark, setDetectedDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (theme !== 'auto') return;
    const check = () => {
      setDetectedDark(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    check();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') check();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [theme]);

  const isDark = theme === 'dark' ? true : theme === 'light' ? false : detectedDark;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={isSquare ? '40 -470 1520 1600' : '72 70 1474 551'}
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      {...props}
    >
      <defs>
        {isDark ? (
          <>
            {/* DARK THEME GRADIENTS (Light Silver / Lavender + Royal Violet) */}
            <linearGradient id={`${idPrefix}-h0`} gradientUnits="userSpaceOnUse" x1="72" y1="0" x2="483" y2="0">
              <stop offset="0.000" stopColor="#c5c4ca"/><stop offset="0.062" stopColor="#acaab3"/><stop offset="0.125" stopColor="#a29faa"/><stop offset="0.188" stopColor="#a19ea9"/><stop offset="0.250" stopColor="#a09da9"/><stop offset="0.312" stopColor="#9c99a5"/><stop offset="0.375" stopColor="#9693a0"/><stop offset="0.438" stopColor="#96939f"/><stop offset="0.500" stopColor="#a09da9"/><stop offset="0.562" stopColor="#b2b0b9"/><stop offset="0.625" stopColor="#c1bfc6"/><stop offset="0.688" stopColor="#c6c4cb"/><stop offset="0.750" stopColor="#c5c4ca"/><stop offset="0.812" stopColor="#c5c3ca"/><stop offset="0.875" stopColor="#c5c4ca"/><stop offset="0.938" stopColor="#c0bec5"/><stop offset="1.000" stopColor="#afacb6"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v0`} gradientUnits="userSpaceOnUse" x1="0" y1="77" x2="0" y2="601">
              <stop offset="0.000" stopColor="#c4c3c9"/><stop offset="0.125" stopColor="#c0bec6"/><stop offset="0.250" stopColor="#b2afb9"/><stop offset="0.375" stopColor="#a7a4af"/><stop offset="0.500" stopColor="#adaab4"/><stop offset="0.625" stopColor="#b5b3bc"/><stop offset="0.750" stopColor="#a5a3ad"/><stop offset="0.875" stopColor="#898693"/><stop offset="1.000" stopColor="#7b7787"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b0`} gradientUnits="userSpaceOnUse" x1="72" y1="77" x2="483" y2="601">
              <stop offset="0" stopColor="#ffffff"/><stop offset=".5" stopColor="#ffffff" stopOpacity=".15"/><stop offset="1" stopColor="#353140"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h1`} gradientUnits="userSpaceOnUse" x1="483" y1="0" x2="1018" y2="0">
              <stop offset="0.000" stopColor="#7c7888"/><stop offset="0.062" stopColor="#a5a2ad"/><stop offset="0.125" stopColor="#c1bfc7"/><stop offset="0.188" stopColor="#d0ced4"/><stop offset="0.250" stopColor="#d7d6da"/><stop offset="0.312" stopColor="#d3d1d7"/><stop offset="0.375" stopColor="#c7c6cc"/><stop offset="0.438" stopColor="#bbb9c1"/><stop offset="0.500" stopColor="#aeacb5"/><stop offset="0.562" stopColor="#a3a1ab"/><stop offset="0.625" stopColor="#9f9ca8"/><stop offset="0.688" stopColor="#9f9ca8"/><stop offset="0.750" stopColor="#9d9aa6"/><stop offset="0.812" stopColor="#9895a1"/><stop offset="0.875" stopColor="#93909c"/><stop offset="0.938" stopColor="#918e9a"/><stop offset="1.000" stopColor="#8d8a97"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v1`} gradientUnits="userSpaceOnUse" x1="0" y1="78" x2="0" y2="613">
              <stop offset="0.000" stopColor="#d9d8dd"/><stop offset="0.125" stopColor="#dfdee2"/><stop offset="0.250" stopColor="#dad9dd"/><stop offset="0.375" stopColor="#cfcdd3"/><stop offset="0.500" stopColor="#c3c2c8"/><stop offset="0.625" stopColor="#b8b6be"/><stop offset="0.750" stopColor="#adaab4"/><stop offset="0.875" stopColor="#a6a3ae"/><stop offset="1.000" stopColor="#a6a4ae"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b1`} gradientUnits="userSpaceOnUse" x1="483" y1="78" x2="1018" y2="613">
              <stop offset="0" stopColor="#ffffff"/><stop offset=".5" stopColor="#ffffff" stopOpacity=".15"/><stop offset="1" stopColor="#353140"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h2`} gradientUnits="userSpaceOnUse" x1="882" y1="0" x2="1116" y2="0">
              <stop offset="0.000" stopColor="#6d5a8c"/><stop offset="0.062" stopColor="#5e3aa5"/><stop offset="0.125" stopColor="#6f47be"/><stop offset="0.188" stopColor="#8260c7"/><stop offset="0.250" stopColor="#825ecb"/><stop offset="0.312" stopColor="#805acb"/><stop offset="0.375" stopColor="#7c56c9"/><stop offset="0.438" stopColor="#7850c7"/><stop offset="0.500" stopColor="#7149c2"/><stop offset="0.562" stopColor="#6b42bd"/><stop offset="0.625" stopColor="#6339b6"/><stop offset="0.688" stopColor="#5c34ad"/><stop offset="0.750" stopColor="#5b35a8"/><stop offset="0.812" stopColor="#57339e"/><stop offset="0.875" stopColor="#49278b"/><stop offset="0.938" stopColor="#452486"/><stop offset="1.000" stopColor="#523095"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v2`} gradientUnits="userSpaceOnUse" x1="0" y1="77" x2="0" y2="618">
              <stop offset="0.000" stopColor="#ad93e2"/><stop offset="0.125" stopColor="#7b53ca"/><stop offset="0.250" stopColor="#693fbe"/><stop offset="0.375" stopColor="#693fbd"/><stop offset="0.500" stopColor="#683fba"/><stop offset="0.625" stopColor="#6139b2"/><stop offset="0.750" stopColor="#5830a9"/><stop offset="0.875" stopColor="#48258d"/><stop offset="1.000" stopColor="#2a1553"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b2`} gradientUnits="userSpaceOnUse" x1="882" y1="77" x2="1116" y2="618">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h3`} gradientUnits="userSpaceOnUse" x1="1143" y1="0" x2="1540" y2="0">
              <stop offset="0.000" stopColor="#9578d0"/><stop offset="0.062" stopColor="#724bc0"/><stop offset="0.125" stopColor="#653db4"/><stop offset="0.188" stopColor="#5e36ae"/><stop offset="0.250" stopColor="#572fa8"/><stop offset="0.312" stopColor="#562da8"/><stop offset="0.375" stopColor="#5d33b2"/><stop offset="0.438" stopColor="#6e42c3"/><stop offset="0.500" stopColor="#8259d3"/><stop offset="0.562" stopColor="#9370d9"/><stop offset="0.625" stopColor="#9c7cdc"/><stop offset="0.688" stopColor="#9f80dd"/><stop offset="0.750" stopColor="#9f80dd"/><stop offset="0.812" stopColor="#9e7fdd"/><stop offset="0.875" stopColor="#9b7bdc"/><stop offset="0.938" stopColor="#8b65d6"/><stop offset="1.000" stopColor="#663fb4"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v3`} gradientUnits="userSpaceOnUse" x1="0" y1="416" x2="0" y2="449">
              <stop offset="0.000" stopColor="#af95e3"/><stop offset="0.125" stopColor="#a487df"/><stop offset="0.250" stopColor="#9c7cdc"/><stop offset="0.375" stopColor="#926ed9"/><stop offset="0.500" stopColor="#825ad3"/><stop offset="0.625" stopColor="#7147c4"/><stop offset="0.750" stopColor="#613bae"/><stop offset="0.875" stopColor="#4d2995"/><stop offset="1.000" stopColor="#311862"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b3`} gradientUnits="userSpaceOnUse" x1="1143" y1="416" x2="1540" y2="449">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h4`} gradientUnits="userSpaceOnUse" x1="1143" y1="0" x2="1540" y2="0">
              <stop offset="0.000" stopColor="#9272d3"/><stop offset="0.062" stopColor="#6f47bf"/><stop offset="0.125" stopColor="#603aad"/><stop offset="0.188" stopColor="#552fa2"/><stop offset="0.250" stopColor="#4c2795"/><stop offset="0.312" stopColor="#4a2691"/><stop offset="0.375" stopColor="#502a9c"/><stop offset="0.438" stopColor="#5e32b4"/><stop offset="0.500" stopColor="#7246ca"/><stop offset="0.562" stopColor="#845cd4"/><stop offset="0.625" stopColor="#8d68d7"/><stop offset="0.688" stopColor="#8f6bd8"/><stop offset="0.750" stopColor="#916dd8"/><stop offset="0.812" stopColor="#916dd8"/><stop offset="0.875" stopColor="#8f6bd8"/><stop offset="0.938" stopColor="#835bd2"/><stop offset="1.000" stopColor="#6740b5"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v4`} gradientUnits="userSpaceOnUse" x1="0" y1="480" x2="0" y2="511">
              <stop offset="0.000" stopColor="#a78ae0"/><stop offset="0.125" stopColor="#9a79db"/><stop offset="0.250" stopColor="#8e69d7"/><stop offset="0.375" stopColor="#8158d2"/><stop offset="0.500" stopColor="#754bc8"/><stop offset="0.625" stopColor="#6840b7"/><stop offset="0.750" stopColor="#5a34a5"/><stop offset="0.875" stopColor="#47258c"/><stop offset="1.000" stopColor="#321964"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b4`} gradientUnits="userSpaceOnUse" x1="1143" y1="480" x2="1540" y2="511">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h5`} gradientUnits="userSpaceOnUse" x1="1143" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#754fc1"/><stop offset="0.062" stopColor="#673fb6"/><stop offset="0.125" stopColor="#5a32aa"/><stop offset="0.188" stopColor="#4b2793"/><stop offset="0.250" stopColor="#3f217c"/><stop offset="0.312" stopColor="#3c1f77"/><stop offset="0.375" stopColor="#432384"/><stop offset="0.438" stopColor="#542ca5"/><stop offset="0.500" stopColor="#6b3dc6"/><stop offset="0.562" stopColor="#7d53d1"/><stop offset="0.625" stopColor="#855dd4"/><stop offset="0.688" stopColor="#8760d5"/><stop offset="0.750" stopColor="#865fd5"/><stop offset="0.812" stopColor="#855dd4"/><stop offset="0.875" stopColor="#845cd4"/><stop offset="0.938" stopColor="#7f56d1"/><stop offset="1.000" stopColor="#724bc0"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v5`} gradientUnits="userSpaceOnUse" x1="0" y1="545" x2="0" y2="619">
              <stop offset="0.000" stopColor="#a689e0"/><stop offset="0.125" stopColor="#8862d5"/><stop offset="0.250" stopColor="#7548ce"/><stop offset="0.375" stopColor="#6e40c9"/><stop offset="0.500" stopColor="#6c40c5"/><stop offset="0.625" stopColor="#6a3ec3"/><stop offset="0.750" stopColor="#653bb9"/><stop offset="0.875" stopColor="#532f9a"/><stop offset="1.000" stopColor="#301c59"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b5`} gradientUnits="userSpaceOnUse" x1="1143" y1="545" x2="1541" y2="619">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h6`} gradientUnits="userSpaceOnUse" x1="1144" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#8462c8"/><stop offset="0.062" stopColor="#6f47bf"/><stop offset="0.125" stopColor="#653bb8"/><stop offset="0.188" stopColor="#5d33b1"/><stop offset="0.250" stopColor="#582ead"/><stop offset="0.312" stopColor="#5a2faf"/><stop offset="0.375" stopColor="#6337bc"/><stop offset="0.438" stopColor="#7b50d0"/><stop offset="0.500" stopColor="#9775da"/><stop offset="0.562" stopColor="#a689e0"/><stop offset="0.625" stopColor="#ab90e2"/><stop offset="0.688" stopColor="#ad93e2"/><stop offset="0.750" stopColor="#ae94e2"/><stop offset="0.812" stopColor="#ad92e2"/><stop offset="0.875" stopColor="#ab90e1"/><stop offset="0.938" stopColor="#9d7ddc"/><stop offset="1.000" stopColor="#7853c2"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v6`} gradientUnits="userSpaceOnUse" x1="0" y1="307" x2="0" y2="385">
              <stop offset="0.000" stopColor="#b18ef6"/><stop offset="0.125" stopColor="#ab90e1"/><stop offset="0.250" stopColor="#a081dd"/><stop offset="0.375" stopColor="#9b7bdc"/><stop offset="0.500" stopColor="#9978db"/><stop offset="0.625" stopColor="#9674da"/><stop offset="0.750" stopColor="#855ed4"/><stop offset="0.875" stopColor="#5d37aa"/><stop offset="1.000" stopColor="#2d165a"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b6`} gradientUnits="userSpaceOnUse" x1="1144" y1="307" x2="1541" y2="385">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h7`} gradientUnits="userSpaceOnUse" x1="1145" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#9270d5"/><stop offset="0.062" stopColor="#7650c2"/><stop offset="0.125" stopColor="#6941b8"/><stop offset="0.188" stopColor="#633bb4"/><stop offset="0.250" stopColor="#6036b4"/><stop offset="0.312" stopColor="#6539bc"/><stop offset="0.375" stopColor="#7347cb"/><stop offset="0.438" stopColor="#8b66d6"/><stop offset="0.500" stopColor="#a182de"/><stop offset="0.562" stopColor="#ac91e2"/><stop offset="0.625" stopColor="#b096e3"/><stop offset="0.688" stopColor="#b096e3"/><stop offset="0.750" stopColor="#af95e3"/><stop offset="0.812" stopColor="#ae94e2"/><stop offset="0.875" stopColor="#ac91e2"/><stop offset="0.938" stopColor="#9978db"/><stop offset="1.000" stopColor="#6c43bd"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v7`} gradientUnits="userSpaceOnUse" x1="0" y1="242" x2="0" y2="278">
              <stop offset="0.000" stopColor="#b18ef6"/><stop offset="0.125" stopColor="#b198e3"/><stop offset="0.250" stopColor="#ad92e2"/><stop offset="0.375" stopColor="#a78ae0"/><stop offset="0.500" stopColor="#9573da"/><stop offset="0.625" stopColor="#7951c8"/><stop offset="0.750" stopColor="#5d38a7"/><stop offset="0.875" stopColor="#432382"/><stop offset="1.000" stopColor="#321b60"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b7`} gradientUnits="userSpaceOnUse" x1="1145" y1="242" x2="1541" y2="278">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h8`} gradientUnits="userSpaceOnUse" x1="1146" y1="0" x2="1544" y2="0">
              <stop offset="0.000" stopColor="#9776da"/><stop offset="0.062" stopColor="#734bc3"/><stop offset="0.125" stopColor="#6439ba"/><stop offset="0.188" stopColor="#6135b9"/><stop offset="0.250" stopColor="#6639c0"/><stop offset="0.312" stopColor="#7649cf"/><stop offset="0.375" stopColor="#9471d9"/><stop offset="0.438" stopColor="#b097e3"/><stop offset="0.500" stopColor="#ba9cf7"/><stop offset="0.562" stopColor="#bfa3f7"/><stop offset="0.625" stopColor="#bfa3f7"/><stop offset="0.688" stopColor="#bfa3f7"/><stop offset="0.750" stopColor="#bea1f7"/><stop offset="0.812" stopColor="#bb9df7"/><stop offset="0.875" stopColor="#ba9bf7"/><stop offset="0.938" stopColor="#9270d5"/><stop offset="1.000" stopColor="#28164c"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v8`} gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="152">
              <stop offset="0.000" stopColor="#c5abf8"/><stop offset="0.125" stopColor="#bfa3f7"/><stop offset="0.250" stopColor="#bc9ef7"/><stop offset="0.375" stopColor="#b99af7"/><stop offset="0.500" stopColor="#b898f7"/><stop offset="0.625" stopColor="#b594f6"/><stop offset="0.750" stopColor="#a081de"/><stop offset="0.875" stopColor="#643eb1"/><stop offset="1.000" stopColor="#26134d"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b8`} gradientUnits="userSpaceOnUse" x1="1146" y1="72" x2="1544" y2="152">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h9`} gradientUnits="userSpaceOnUse" x1="1146" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#8c6ccc"/><stop offset="0.062" stopColor="#744dc1"/><stop offset="0.125" stopColor="#6941b9"/><stop offset="0.188" stopColor="#653db5"/><stop offset="0.250" stopColor="#643ab8"/><stop offset="0.312" stopColor="#6c41c2"/><stop offset="0.375" stopColor="#7b50d1"/><stop offset="0.438" stopColor="#9471d9"/><stop offset="0.500" stopColor="#a88ce1"/><stop offset="0.562" stopColor="#b39ae4"/><stop offset="0.625" stopColor="#af8cf6"/><stop offset="0.688" stopColor="#af8bf6"/><stop offset="0.750" stopColor="#ae8af5"/><stop offset="0.812" stopColor="#b198e3"/><stop offset="0.875" stopColor="#b096e3"/><stop offset="0.938" stopColor="#9b7bdc"/><stop offset="1.000" stopColor="#6941ba"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v9`} gradientUnits="userSpaceOnUse" x1="0" y1="179" x2="0" y2="215">
              <stop offset="0.000" stopColor="#b696f7"/><stop offset="0.125" stopColor="#b08df6"/><stop offset="0.250" stopColor="#b198e4"/><stop offset="0.375" stopColor="#ab90e1"/><stop offset="0.500" stopColor="#9877db"/><stop offset="0.625" stopColor="#7b55c8"/><stop offset="0.750" stopColor="#603ca9"/><stop offset="0.875" stopColor="#42247f"/><stop offset="1.000" stopColor="#241248"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b9`} gradientUnits="userSpaceOnUse" x1="1146" y1="179" x2="1541" y2="215">
              <stop offset="0" stopColor="#f5f0ff"/><stop offset=".5" stopColor="#f5f0ff" stopOpacity=".15"/><stop offset="1" stopColor="#24164b"/>
            </linearGradient>
          </>
        ) : (
          <>
            {/* LIGHT THEME GRADIENTS (High-Contrast Dark Slate #1E293B + Deep Purple #5B21B6 + Light-Blue Accent #5881d5 / #739be6) */}
            <linearGradient id={`${idPrefix}-h0`} gradientUnits="userSpaceOnUse" x1="72" y1="0" x2="483" y2="0">
              <stop offset="0.000" stopColor="#0f172a"/><stop offset="0.250" stopColor="#1e293b"/><stop offset="0.500" stopColor="#334155"/><stop offset="0.750" stopColor="#1e293b"/><stop offset="1.000" stopColor="#0f172a"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v0`} gradientUnits="userSpaceOnUse" x1="0" y1="77" x2="0" y2="601">
              <stop offset="0.000" stopColor="#334155"/><stop offset="0.500" stopColor="#1e293b"/><stop offset="1.000" stopColor="#0f172a"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b0`} gradientUnits="userSpaceOnUse" x1="72" y1="77" x2="483" y2="601">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#0f172a"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h1`} gradientUnits="userSpaceOnUse" x1="483" y1="0" x2="1018" y2="0">
              <stop offset="0.000" stopColor="#0f172a"/><stop offset="0.300" stopColor="#1e293b"/><stop offset="0.600" stopColor="#334155"/><stop offset="0.850" stopColor="#2e1065"/><stop offset="1.000" stopColor="#1e1b4b"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v1`} gradientUnits="userSpaceOnUse" x1="0" y1="78" x2="0" y2="613">
              <stop offset="0.000" stopColor="#334155"/><stop offset="0.500" stopColor="#1e293b"/><stop offset="1.000" stopColor="#0f172a"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b1`} gradientUnits="userSpaceOnUse" x1="483" y1="78" x2="1018" y2="613">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#0f172a"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h2`} gradientUnits="userSpaceOnUse" x1="882" y1="0" x2="1116" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.250" stopColor="#6d28d9"/><stop offset="0.500" stopColor="#7c3aed"/><stop offset="0.750" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v2`} gradientUnits="userSpaceOnUse" x1="0" y1="77" x2="0" y2="618">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.400" stopColor="#5b21b6"/><stop offset="0.800" stopColor="#4c1d95"/><stop offset="1.000" stopColor="#2e1065"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b2`} gradientUnits="userSpaceOnUse" x1="882" y1="77" x2="1116" y2="618">
              <stop offset="0" stopColor="#739be6"/><stop offset=".5" stopColor="#5881d5" stopOpacity=".4"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h3`} gradientUnits="userSpaceOnUse" x1="1143" y1="0" x2="1540" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#6d28d9"/><stop offset="1.000" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v3`} gradientUnits="userSpaceOnUse" x1="0" y1="416" x2="0" y2="449">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b3`} gradientUnits="userSpaceOnUse" x1="1143" y1="416" x2="1540" y2="449">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h4`} gradientUnits="userSpaceOnUse" x1="1143" y1="0" x2="1540" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#6d28d9"/><stop offset="1.000" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v4`} gradientUnits="userSpaceOnUse" x1="0" y1="480" x2="0" y2="511">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b4`} gradientUnits="userSpaceOnUse" x1="1143" y1="480" x2="1540" y2="511">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h5`} gradientUnits="userSpaceOnUse" x1="1143" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#6d28d9"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v5`} gradientUnits="userSpaceOnUse" x1="0" y1="545" x2="0" y2="619">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#2e1065"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b5`} gradientUnits="userSpaceOnUse" x1="1143" y1="545" x2="1541" y2="619">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h6`} gradientUnits="userSpaceOnUse" x1="1144" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#7c3aed"/><stop offset="1.000" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v6`} gradientUnits="userSpaceOnUse" x1="0" y1="307" x2="0" y2="385">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#2e1065"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b6`} gradientUnits="userSpaceOnUse" x1="1144" y1="307" x2="1541" y2="385">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h7`} gradientUnits="userSpaceOnUse" x1="1145" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#6d28d9"/><stop offset="1.000" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v7`} gradientUnits="userSpaceOnUse" x1="0" y1="242" x2="0" y2="278">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b7`} gradientUnits="userSpaceOnUse" x1="1145" y1="242" x2="1541" y2="278">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h8`} gradientUnits="userSpaceOnUse" x1="1146" y1="0" x2="1544" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#7c3aed"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v8`} gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="152">
              <stop offset="0.000" stopColor="#8b5cf6"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#2e1065"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b8`} gradientUnits="userSpaceOnUse" x1="1146" y1="72" x2="1544" y2="152">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>

            <linearGradient id={`${idPrefix}-h9`} gradientUnits="userSpaceOnUse" x1="1146" y1="0" x2="1541" y2="0">
              <stop offset="0.000" stopColor="#5b21b6"/><stop offset="0.500" stopColor="#6d28d9"/><stop offset="1.000" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-v9`} gradientUnits="userSpaceOnUse" x1="0" y1="179" x2="0" y2="215">
              <stop offset="0.000" stopColor="#7c3aed"/><stop offset="0.500" stopColor="#5b21b6"/><stop offset="1.000" stopColor="#3b0764"/>
            </linearGradient>
            <linearGradient id={`${idPrefix}-b9`} gradientUnits="userSpaceOnUse" x1="1146" y1="179" x2="1541" y2="215">
              <stop offset="0" stopColor="#5881d5"/><stop offset=".5" stopColor="#739be6" stopOpacity=".35"/><stop offset="1" stopColor="#2e1065"/>
            </linearGradient>
          </>
        )}

        {/* Clip Paths */}
        <clipPath id={`${idPrefix}-c0`}>
          <path d="M150 79 L480 79 L480 190 L188 190 L188 272 L415 272 L480 337 L480 535 L396 600 L150 600 L75 533 L75 455 L183 455 L183 492 L368 492 L368 378 L148 378 L80 312 L80 150Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c1`}>
          <path d="M1015.0 79.0 L983.2 78.2 L975.8 86.0 L828.2 461.0 L816.8 481.2 L810.2 477.8 L619.2 87.2 L612.2 83.0 L531.5 85.8 L525.0 287.5 L524.0 563.2 L513.5 592.5 L486.8 610.8 L643.0 609.5 L615.5 594.0 L606.0 568.2 L611.0 271.0 L615.8 265.2 L624.8 270.5 L642.5 313.5 L788.2 604.5 L793.5 609.8 L798.8 607.8 L838.2 509.0 L870.2 443.8 L876.8 420.8 L886.5 410.2 L1016.0 89.0Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c2`}>
          <path d="M1065.2 77.2 L1051.8 77.2 L1046.0 82.0 L883.5 464.0 L885.0 468.5 L891.2 464.2 L981.0 316.2 L988.0 316.2 L992.0 364.5 L992.0 572.2 L986.0 587.8 L976.0 598.2 L952.5 608.2 L956.8 617.5 L1111.0 616.5 L1115.2 612.5 L1113.0 606.8 L1081.2 594.0 L1074.8 576.2 L1070.8 84.8Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c3`}>
          <path d="M1146 416 H1530.1 Q1540 416 1540 425.9 V439.1 Q1540 449 1530.1 449 H1146 Q1143 449 1143 446 V419 Q1143 416 1146 416Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c4`}>
          <path d="M1146 480 H1530.7 Q1540 480 1540 489.3 V501.7 Q1540 511 1530.7 511 H1146 Q1143 511 1143 508 V483 Q1143 480 1146 480Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c5`}>
          <path d="M1146 545 H1511 Q1541 545 1541 575 V589 Q1541 619 1511 619 H1146 Q1143 619 1143 616 V548 Q1143 545 1146 545Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c6`}>
          <path d="M1147 307 H1511 Q1541 307 1541 337 V355 Q1541 385 1511 385 H1147 Q1144 385 1144 382 V310 Q1144 307 1147 307Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c7`}>
          <path d="M1148 242 H1530.2 Q1541 242 1541 252.8 V267.2 Q1541 278 1530.2 278 H1148 Q1145 278 1145 275 V245 Q1145 242 1148 242Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c8`}>
          <path d="M1149 72 H1514 Q1544 72 1544 102 V122 Q1544 152 1514 152 H1149 Q1146 152 1146 149 V75 Q1146 72 1149 72Z" />
        </clipPath>
        <clipPath id={`${idPrefix}-c9`}>
          <path d="M1149 179 H1530.2 Q1541 179 1541 189.8 V204.2 Q1541 215 1530.2 215 H1149 Q1146 215 1146 212 V182 Q1146 179 1149 179Z" />
        </clipPath>
      </defs>

      {/* Letter 'S' (Group 0) */}
      <g>
        <path
          d="M150 79 L480 79 L480 190 L188 190 L188 272 L415 272 L480 337 L480 535 L396 600 L150 600 L75 533 L75 455 L183 455 L183 492 L368 492 L368 378 L148 378 L80 312 L80 150Z"
          fill={`url(#${idPrefix}-h0)`}
        />
        <path
          d="M150 79 L480 79 L480 190 L188 190 L188 272 L415 272 L480 337 L480 535 L396 600 L150 600 L75 533 L75 455 L183 455 L183 492 L368 492 L368 378 L148 378 L80 312 L80 150Z"
          fill={`url(#${idPrefix}-v0)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c0)`}>
          <path
            d="M150 79 L480 79 L480 190 L188 190 L188 272 L415 272 L480 337 L480 535 L396 600 L150 600 L75 533 L75 455 L183 455 L183 492 L368 492 L368 378 L148 378 L80 312 L80 150Z"
            fill="none"
            stroke={`url(#${idPrefix}-b0)`}
            strokeWidth={9}
            opacity=".85"
          />
          <path
            d="M150 79 L480 79 L480 190 L188 190 L188 272 L415 272 L480 337 L480 535 L396 600 L150 600 L75 533 L75 455 L183 455 L183 492 L368 492 L368 378 L148 378 L80 312 L80 150Z"
            fill="none"
            stroke={isDark ? '#353140' : '#0f172a'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'M' Left (Group 1) */}
      <g>
        <path
          d="M1015.0 79.0 L983.2 78.2 L975.8 86.0 L828.2 461.0 L816.8 481.2 L810.2 477.8 L619.2 87.2 L612.2 83.0 L531.5 85.8 L525.0 287.5 L524.0 563.2 L513.5 592.5 L486.8 610.8 L643.0 609.5 L615.5 594.0 L606.0 568.2 L611.0 271.0 L615.8 265.2 L624.8 270.5 L642.5 313.5 L788.2 604.5 L793.5 609.8 L798.8 607.8 L838.2 509.0 L870.2 443.8 L876.8 420.8 L886.5 410.2 L1016.0 89.0Z"
          fill={`url(#${idPrefix}-h1)`}
        />
        <path
          d="M1015.0 79.0 L983.2 78.2 L975.8 86.0 L828.2 461.0 L816.8 481.2 L810.2 477.8 L619.2 87.2 L612.2 83.0 L531.5 85.8 L525.0 287.5 L524.0 563.2 L513.5 592.5 L486.8 610.8 L643.0 609.5 L615.5 594.0 L606.0 568.2 L611.0 271.0 L615.8 265.2 L624.8 270.5 L642.5 313.5 L788.2 604.5 L793.5 609.8 L798.8 607.8 L838.2 509.0 L870.2 443.8 L876.8 420.8 L886.5 410.2 L1016.0 89.0Z"
          fill={`url(#${idPrefix}-v1)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c1)`}>
          <path
            d="M1015.0 79.0 L983.2 78.2 L975.8 86.0 L828.2 461.0 L816.8 481.2 L810.2 477.8 L619.2 87.2 L612.2 83.0 L531.5 85.8 L525.0 287.5 L524.0 563.2 L513.5 592.5 L486.8 610.8 L643.0 609.5 L615.5 594.0 L606.0 568.2 L611.0 271.0 L615.8 265.2 L624.8 270.5 L642.5 313.5 L788.2 604.5 L793.5 609.8 L798.8 607.8 L838.2 509.0 L870.2 443.8 L876.8 420.8 L886.5 410.2 L1016.0 89.0Z"
            fill="none"
            stroke={`url(#${idPrefix}-b1)`}
            strokeWidth={9}
            opacity=".85"
          />
          <path
            d="M1015.0 79.0 L983.2 78.2 L975.8 86.0 L828.2 461.0 L816.8 481.2 L810.2 477.8 L619.2 87.2 L612.2 83.0 L531.5 85.8 L525.0 287.5 L524.0 563.2 L513.5 592.5 L486.8 610.8 L643.0 609.5 L615.5 594.0 L606.0 568.2 L611.0 271.0 L615.8 265.2 L624.8 270.5 L642.5 313.5 L788.2 604.5 L793.5 609.8 L798.8 607.8 L838.2 509.0 L870.2 443.8 L876.8 420.8 L886.5 410.2 L1016.0 89.0Z"
            fill="none"
            stroke={isDark ? '#353140' : '#0f172a'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'M' Right (Group 2) */}
      <g>
        <path
          d="M1065.2 77.2 L1051.8 77.2 L1046.0 82.0 L883.5 464.0 L885.0 468.5 L891.2 464.2 L981.0 316.2 L988.0 316.2 L992.0 364.5 L992.0 572.2 L986.0 587.8 L976.0 598.2 L952.5 608.2 L956.8 617.5 L1111.0 616.5 L1115.2 612.5 L1113.0 606.8 L1081.2 594.0 L1074.8 576.2 L1070.8 84.8Z"
          fill={`url(#${idPrefix}-h2)`}
        />
        <path
          d="M1065.2 77.2 L1051.8 77.2 L1046.0 82.0 L883.5 464.0 L885.0 468.5 L891.2 464.2 L981.0 316.2 L988.0 316.2 L992.0 364.5 L992.0 572.2 L986.0 587.8 L976.0 598.2 L952.5 608.2 L956.8 617.5 L1111.0 616.5 L1115.2 612.5 L1113.0 606.8 L1081.2 594.0 L1074.8 576.2 L1070.8 84.8Z"
          fill={`url(#${idPrefix}-v2)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c2)`}>
          <path
            d="M1065.2 77.2 L1051.8 77.2 L1046.0 82.0 L883.5 464.0 L885.0 468.5 L891.2 464.2 L981.0 316.2 L988.0 316.2 L992.0 364.5 L992.0 572.2 L986.0 587.8 L976.0 598.2 L952.5 608.2 L956.8 617.5 L1111.0 616.5 L1115.2 612.5 L1113.0 606.8 L1081.2 594.0 L1074.8 576.2 L1070.8 84.8Z"
            fill="none"
            stroke={`url(#${idPrefix}-b2)`}
            strokeWidth={9}
            opacity=".85"
          />
          <path
            d="M1065.2 77.2 L1051.8 77.2 L1046.0 82.0 L883.5 464.0 L885.0 468.5 L891.2 464.2 L981.0 316.2 L988.0 316.2 L992.0 364.5 L992.0 572.2 L986.0 587.8 L976.0 598.2 L952.5 608.2 L956.8 617.5 L1111.0 616.5 L1115.2 612.5 L1113.0 606.8 L1081.2 594.0 L1074.8 576.2 L1070.8 84.8Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Bar 3 (Group 3) */}
      <g>
        <path
          d="M1146 416 H1530.1 Q1540 416 1540 425.9 V439.1 Q1540 449 1530.1 449 H1146 Q1143 449 1143 446 V419 Q1143 416 1146 416Z"
          fill={`url(#${idPrefix}-h3)`}
        />
        <path
          d="M1146 416 H1530.1 Q1540 416 1540 425.9 V439.1 Q1540 449 1530.1 449 H1146 Q1143 449 1143 446 V419 Q1143 416 1146 416Z"
          fill={`url(#${idPrefix}-v3)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c3)`}>
          <path
            d="M1146 416 H1530.1 Q1540 416 1540 425.9 V439.1 Q1540 449 1530.1 449 H1146 Q1143 449 1143 446 V419 Q1143 416 1146 416Z"
            fill="none"
            stroke={`url(#${idPrefix}-b3)`}
            strokeWidth={7}
            opacity=".85"
          />
          <path
            d="M1146 416 H1530.1 Q1540 416 1540 425.9 V439.1 Q1540 449 1530.1 449 H1146 Q1143 449 1143 446 V419 Q1143 416 1146 416Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Bar 2 (Group 4) */}
      <g>
        <path
          d="M1146 480 H1530.7 Q1540 480 1540 489.3 V501.7 Q1540 511 1530.7 511 H1146 Q1143 511 1143 508 V483 Q1143 480 1146 480Z"
          fill={`url(#${idPrefix}-h4)`}
        />
        <path
          d="M1146 480 H1530.7 Q1540 480 1540 489.3 V501.7 Q1540 511 1530.7 511 H1146 Q1143 511 1143 508 V483 Q1143 480 1146 480Z"
          fill={`url(#${idPrefix}-v4)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c4)`}>
          <path
            d="M1146 480 H1530.7 Q1540 480 1540 489.3 V501.7 Q1540 511 1530.7 511 H1146 Q1143 511 1143 508 V483 Q1143 480 1146 480Z"
            fill="none"
            stroke={`url(#${idPrefix}-b4)`}
            strokeWidth={7}
            opacity=".85"
          />
          <path
            d="M1146 480 H1530.7 Q1540 480 1540 489.3 V501.7 Q1540 511 1530.7 511 H1146 Q1143 511 1143 508 V483 Q1143 480 1146 480Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Bottom Bar (Group 5) */}
      <g>
        <path
          d="M1146 545 H1511 Q1541 545 1541 575 V589 Q1541 619 1511 619 H1146 Q1143 619 1143 616 V548 Q1143 545 1146 545Z"
          fill={`url(#${idPrefix}-h5)`}
        />
        <path
          d="M1146 545 H1511 Q1541 545 1541 575 V589 Q1541 619 1511 619 H1146 Q1143 619 1143 616 V548 Q1143 545 1146 545Z"
          fill={`url(#${idPrefix}-v5)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c5)`}>
          <path
            d="M1146 545 H1511 Q1541 545 1541 575 V589 Q1541 619 1511 619 H1146 Q1143 619 1143 616 V548 Q1143 545 1146 545Z"
            fill="none"
            stroke={`url(#${idPrefix}-b5)`}
            strokeWidth={9}
            opacity=".85"
          />
          <path
            d="M1146 545 H1511 Q1541 545 1541 575 V589 Q1541 619 1511 619 H1146 Q1143 619 1143 616 V548 Q1143 545 1146 545Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Middle Bar (Group 6) */}
      <g>
        <path
          d="M1147 307 H1511 Q1541 307 1541 337 V355 Q1541 385 1511 385 H1147 Q1144 385 1144 382 V310 Q1144 307 1147 307Z"
          fill={`url(#${idPrefix}-h6)`}
        />
        <path
          d="M1147 307 H1511 Q1541 307 1541 337 V355 Q1541 385 1511 385 H1147 Q1144 385 1144 382 V310 Q1144 307 1147 307Z"
          fill={`url(#${idPrefix}-v6)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c6)`}>
          <path
            d="M1147 307 H1511 Q1541 307 1541 337 V355 Q1541 385 1511 385 H1147 Q1144 385 1144 382 V310 Q1144 307 1147 307Z"
            fill="none"
            stroke={`url(#${idPrefix}-b6)`}
            strokeWidth={9}
            opacity=".85"
          />
          <path
            d="M1147 307 H1511 Q1541 307 1541 337 V355 Q1541 385 1511 385 H1147 Q1144 385 1144 382 V310 Q1144 307 1147 307Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Bar 4 (Group 7) */}
      <g>
        <path
          d="M1148 242 H1530.2 Q1541 242 1541 252.8 V267.2 Q1541 278 1530.2 278 H1148 Q1145 278 1145 275 V245 Q1145 242 1148 242Z"
          fill={`url(#${idPrefix}-h7)`}
        />
        <path
          d="M1148 242 H1530.2 Q1541 242 1541 252.8 V267.2 Q1541 278 1530.2 278 H1148 Q1145 278 1145 275 V245 Q1145 242 1148 242Z"
          fill={`url(#${idPrefix}-v7)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c7)`}>
          <path
            d="M1148 242 H1530.2 Q1541 242 1541 252.8 V267.2 Q1541 278 1530.2 278 H1148 Q1145 278 1145 275 V245 Q1145 242 1148 242Z"
            fill="none"
            stroke={`url(#${idPrefix}-b7)`}
            strokeWidth={7}
            opacity=".85"
          />
          <path
            d="M1148 242 H1530.2 Q1541 242 1541 252.8 V267.2 Q1541 278 1530.2 278 H1148 Q1145 278 1145 275 V245 Q1145 242 1148 242Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Top Bar (Group 8) */}
      <g>
        <path
          d="M1149 72 H1514 Q1544 72 1544 102 V122 Q1544 152 1514 152 H1149 Q1146 152 1146 149 V75 Q1146 72 1149 72Z"
          fill={`url(#${idPrefix}-h8)`}
        />
        <path
          d="M1149 72 H1514 Q1544 72 1544 102 V122 Q1544 152 1514 152 H1149 Q1146 152 1146 149 V75 Q1146 72 1149 72Z"
          fill={`url(#${idPrefix}-v8)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c8)`}>
          <path
            d="M1149 72 H1514 Q1544 72 1544 102 V122 Q1544 152 1514 152 H1149 Q1146 152 1146 149 V75 Q1146 72 1149 72Z"
            fill="none"
            stroke={`url(#${idPrefix}-b8)`}
            strokeWidth={9}
            opacity=".85"
          />
          <path
            d="M1149 72 H1514 Q1544 72 1544 102 V122 Q1544 152 1514 152 H1149 Q1146 152 1146 149 V75 Q1146 72 1149 72Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>

      {/* Letter 'E' Bar 6 (Group 9) */}
      <g>
        <path
          d="M1149 179 H1530.2 Q1541 179 1541 189.8 V204.2 Q1541 215 1530.2 215 H1149 Q1146 215 1146 212 V182 Q1146 179 1149 179Z"
          fill={`url(#${idPrefix}-h9)`}
        />
        <path
          d="M1149 179 H1530.2 Q1541 179 1541 189.8 V204.2 Q1541 215 1530.2 215 H1149 Q1146 215 1146 212 V182 Q1146 179 1149 179Z"
          fill={`url(#${idPrefix}-v9)`}
          opacity=".35"
        />
        <g clipPath={`url(#${idPrefix}-c9)`}>
          <path
            d="M1149 179 H1530.2 Q1541 179 1541 189.8 V204.2 Q1541 215 1530.2 215 H1149 Q1146 215 1146 212 V182 Q1146 179 1149 179Z"
            fill="none"
            stroke={`url(#${idPrefix}-b9)`}
            strokeWidth={7}
            opacity=".85"
          />
          <path
            d="M1149 179 H1530.2 Q1541 179 1541 189.8 V204.2 Q1541 215 1530.2 215 H1149 Q1146 215 1146 212 V182 Q1146 179 1149 179Z"
            fill="none"
            stroke={isDark ? '#24164b' : '#2e1065'}
            strokeOpacity=".35"
            strokeWidth={1.5}
          />
        </g>
      </g>
    </svg>
  );
};

export default SmeLogo;
