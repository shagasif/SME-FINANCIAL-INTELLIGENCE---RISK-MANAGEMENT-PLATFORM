import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PARTICLE_COUNT = 3000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type SwarmParticle = {
  phi: number;
  theta: number;
  phase: number;
  size: number;
};

function ParticleSwarm({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const particles = useMemo<SwarmParticle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const vertical = 1 - ((index + 0.5) / PARTICLE_COUNT) * 2;
        return {
          phi: Math.acos(vertical),
          theta: GOLDEN_ANGLE * index,
          phase: index * 0.37,
          size: 0.65 + (index % 5) * 0.12,
        };
      }),
    [],
  );
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(0.055), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
        transparent: true,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = reducedMotion ? 0 : clock.getElapsedTime();
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const particle = particles[index];
      const theta = particle.theta + time * 0.035;
      const pulse =
        Math.sin(particle.theta * 5 + time * 1.2 + particle.phase) * 0.45 +
        Math.cos(particle.phi * 6 - time * 1.4) * 0.3;
      const radius = 4.15 + pulse;
      const sinPhi = Math.sin(particle.phi);
      const signal = Math.max(0, Math.sin(particle.phase - time * 2.2));

      dummy.position.set(
        radius * sinPhi * Math.cos(theta),
        radius * Math.cos(particle.phi),
        radius * sinPhi * Math.sin(theta),
      );
      dummy.rotation.set(particle.phi, theta, particle.phase);
      dummy.scale.setScalar(particle.size * (0.75 + signal));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);

      if (signal > 0.85) {
        const brightness = (signal - 0.85) / 0.15;
        color.setRGB(0.72 + brightness * 0.25, 0.6 + brightness * 0.3, 0.9 + brightness * 0.1);
      } else {
        const hue = 0.72 + 0.12 * Math.sin(theta + time * 0.3);
        const lightness = 0.18 + 0.2 * (pulse * 0.5 + 0.5) + signal * 0.12;
        color.setHSL(hue, 0.72, lightness);
      }
      mesh.setColorAt(index, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y = time * 0.06;
      groupRef.current.rotation.x = Math.sin(time * 0.08) * 0.06;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, PARTICLE_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}

export function ParticleSwarmVisual() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  const supportsWebGL = typeof window !== 'undefined' && 'WebGLRenderingContext' in window;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {supportsWebGL && (
        <Canvas
          camera={{ position: [0, 0, 12], fov: 48 }}
          dpr={[1, 1.25]}
          frameloop={reducedMotion ? 'demand' : 'always'}
          gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
        >
          <ParticleSwarm reducedMotion={reducedMotion} />
        </Canvas>
      )}
      <div className="landing-particle-fade absolute inset-0" />
      <div className="landing-particle-vignette absolute inset-0" />
    </div>
  );
}
