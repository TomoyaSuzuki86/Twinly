import fs from 'node:fs';

const path = 'src/lib/tutorial-anchors.test.tsx';
let source = fs.readFileSync(path, 'utf8');
source = source.replace('import { useEffect } from "react";\n', '');
const before = `    let registry: TutorialAnchorRegistry | null = null;
    const Harness = () => {
      const anchors = useTutorialAnchors();
      useEffect(() => { registry = anchors; }, [anchors]);
      return <button ref={anchors.ref("settings")}>設定</button>;
    };

    render(<Harness />);
    const button = screen.getByRole("button", { name: "設定" });
    expect(registry?.get("settings")).toBe(button);`;
const after = `    const registryRef: { current: TutorialAnchorRegistry | null } = { current: null };
    const Harness = () => {
      const anchors = useTutorialAnchors();
      registryRef.current = anchors;
      return <button ref={anchors.ref("settings")}>設定</button>;
    };

    render(<Harness />);
    const button = screen.getByRole("button", { name: "設定" });
    const registry = registryRef.current as TutorialAnchorRegistry;
    expect(registry.get("settings")).toBe(button);`;
if (!source.includes(before)) throw new Error('STEP 9 test typing target not found');
source = source.replace(before, after);
fs.writeFileSync(path, source);
