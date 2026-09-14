import fs from 'node:fs';

const path = 'src/lib/tutorial-anchors.test.tsx';
let source = fs.readFileSync(path, 'utf8');
source = source.replace('import { useEffect } from "react";\n', '');
source = source.replace(
`    let registry: TutorialAnchorRegistry | null = null;
    const Harness = () => {
      const anchors = useTutorialAnchors();
      useEffect(() => { registry = anchors; }, [anchors]);
      return <button ref={anchors.ref("settings")}>設定</button>;
    };

    render(<Harness />);
    const button = screen.getByRole("button", { name: "設定" });
    expect(registry?.get("settings")).toBe(button);`,
`    const registryRef: { current: TutorialAnchorRegistry | null } = { current: null };
    const Harness = () => {
      const anchors = useTutorialAnchors();
      registryRef.current = anchors;
      return <button ref={anchors.ref("settings")}>設定</button>;
    };

    render(<Harness />);
    const button = screen.getByRole("button", { name: "設定" });
    const registry = registryRef.current as TutorialAnchorRegistry;
    expect(registry.get("settings")).toBe(button);`
);
fs.writeFileSync(path, source);
