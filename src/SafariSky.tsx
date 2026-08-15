import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function BirdFlock() {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const birds = useMemo(
    () => Array.from({ length: 14 }, (_, index) => ({
      x: -7 + (index % 7) * 2.1,
      y: 1.4 + Math.floor(index / 7) * 1.1 + Math.sin(index) * 0.4,
      speed: 0.16 + (index % 4) * 0.025,
      scale: 0.25 + (index % 3) * 0.08,
    })),
    [],
  );

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.position.x += delta * 0.23;
    if (group.current.position.x > 7) group.current.position.x = -7;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, pointer.x * 0.08, 0.03);
    group.current.children.forEach((bird, index) => {
      bird.position.y += Math.sin(state.clock.elapsedTime * 2 + index) * birds[index].speed * delta;
      bird.rotation.z = Math.sin(state.clock.elapsedTime * 3.1 + index) * 0.08;
    });
  });

  return (
    <group ref={group} position={[-4, 0.5, 0]}>
      {birds.map((bird, index) => (
        <group key={index} position={[bird.x, bird.y, 0]} scale={bird.scale}>
          <mesh rotation={[0, 0, 0.22]} position={[-0.23, 0, 0]}>
            <planeGeometry args={[0.55, 0.07]} />
            <meshBasicMaterial color="#f2eadb" transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[0, 0, -0.22]} position={[0.23, 0, 0]}>
            <planeGeometry args={[0.55, 0.07]} />
            <meshBasicMaterial color="#f2eadb" transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Dust() {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(240 * 3);
    for (let index = 0; index < values.length; index += 3) {
      values[index] = (Math.random() - 0.5) * 16;
      values[index + 1] = (Math.random() - 0.5) * 7;
      values[index + 2] = (Math.random() - 0.5) * 3;
    }
    return values;
  }, []);

  useFrame((_, delta) => {
    if (points.current) points.current.rotation.y += delta * 0.012;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#d5aa62" size={0.025} transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

export default function SafariSky() {
  return (
    <div className="safari-sky" aria-hidden="true">
      <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 75 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: false }}>
        <BirdFlock />
        <Dust />
      </Canvas>
    </div>
  );
}