import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TALENT_UNLOCK_LEVEL } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import { classDefStore } from "../stores/classDefStore";
import { HudPanel } from "../components/HudPanel";
import { CharacterTab } from "./CharacterTab";
import { TalentTab } from "./TalentTab";
import { SpellbookTab } from "./SpellbookTab";
import { EquipmentTab } from "./EquipmentTab";

export type SheetTab = "character" | "equipment" | "talents" | "skills";

type TabDef = {
  id: SheetTab;
  labelKey: string;
  badge?: number;
};

const TabButton = ({
  tab,
  active,
  onClick,
}: {
  tab: TabDef;
  active: boolean;
  onClick: () => void;
}): ReactNode => {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-b-2 border-sky-400 text-sky-300"
          : "border-b-2 border-transparent text-slate-500 hover:text-slate-300"
      }`}
    >
      {t(tab.labelKey)}
      {tab.badge !== undefined && tab.badge > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500/30 px-1 text-[9px] font-bold text-sky-300">
          {tab.badge}
        </span>
      )}
    </button>
  );
};

export const CharacterSheet = ({
  onClose,
  initialTab = "character",
}: {
  onClose: () => void;
  initialTab?: SheetTab;
}): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const classDefs = useSyncExternalStore(classDefStore.subscribe, classDefStore.getSnapshot);
  const local = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);

  const [activeTab, setActiveTab] = useState<SheetTab>(initialTab);

  // Sync initialTab when it changes externally (e.g. pressing N while panel is open on character tab)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const classDef = local?.classId ? classDefs.get(local.classId) : undefined;
  const statPoints = local?.statPoints ?? 0;
  const talentPoints = local?.talentPoints ?? 0;
  const playerLevel = local?.level ?? 1;

  const tabs: TabDef[] = useMemo(
    () => [
      { id: "character", labelKey: "character.tabCharacter", badge: statPoints },
      { id: "equipment" as SheetTab, labelKey: "character.tabEquipment" },
      ...(playerLevel >= TALENT_UNLOCK_LEVEL
        ? [{ id: "talents" as SheetTab, labelKey: "character.tabTalents", badge: talentPoints }]
        : []),
      { id: "skills", labelKey: "character.tabSkills" },
    ],
    [statPoints, talentPoints, playerLevel],
  );

  return (
    <HudPanel
      onClose={onClose}
      header={
        <div>
          <h3 className="text-sm font-bold text-slate-100">{local?.name}</h3>
          <span className="text-[11px] text-sky-400">
            {t("character.level", { level: local?.level })}
            {classDef && ` — ${t(classDef.name)}`}
          </span>
        </div>
      }
      panelId="character-sheet"
      defaultPosition={{ x: window.innerWidth - 320, y: 56 }}
      className="w-80"
      fitKey={activeTab}
    >
      {/* Tab bar */}
      <div className="-mx-3 mb-3 flex border-b border-slate-700/50 px-1">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "character" && <CharacterTab />}
      {activeTab === "equipment" && <EquipmentTab />}
      {activeTab === "talents" && <TalentTab />}
      {activeTab === "skills" && <SpellbookTab />}
    </HudPanel>
  );
};
