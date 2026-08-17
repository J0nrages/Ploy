import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Points } from "three";

function makeStars(count: number, spread: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.55;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  return positions;
}

export function Starfield() {
  const near = useRef<Points>(null);
  const far = useRef<Points>(null);
  const nebulae = useRef<Group>(null);
  const nearStars = useMemo(() => makeStars(1800, 70), []);
  const farStars = useMemo(() => makeStars(900, 110), []);

  useFrame((_, delta) => {
    if (near.current) {
      near.current.rotation.y += delta * 0.012;
      near.current.position.z = ((near.current.position.z + delta * 0.55) % 24) - 12;
    }
    if (far.current) {
      far.current.rotation.y -= delta * 0.004;
      far.current.rotation.x += delta * 0.0015;
    }
    if (nebulae.current) {
      nebulae.current.rotation.y += delta * 0.008;
      nebulae.current.position.x = Math.sin(performance.now() * 0.00008) * 2.4;
    }
  });

  return (
    <group>
      <points ref={far} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[farStars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#c9b6ff" size={0.045} sizeAttenuation transparent opacity={0.55} />
      </points>
      <points ref={near} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[nearStars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#fff7fb" size={0.07} sizeAttenuation transparent opacity={0.9} />
      </points>
      <group ref={nebulae}>
        <mesh position={[-18, -6, -22]}>
          <sphereGeometry args={[10, 24, 24]} />
          <meshBasicMaterial color="#6b2d8b" transparent opacity={0.16} depthWrite={false} />
        </mesh>
        <mesh position={[16, 4, -28]}>
          <sphereGeometry args={[12, 24, 24]} />
          <meshBasicMaterial color="#2a4d8f" transparent opacity={0.12} depthWrite={false} />
        </mesh>
        <mesh position={[2, -8, -18]}>
          <sphereGeometry args={[8, 24, 24]} />
          <meshBasicMaterial color="#c24b6e" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
