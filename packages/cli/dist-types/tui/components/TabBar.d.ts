import React from 'react';
export declare const TABS: readonly [{
    readonly id: "overview";
    readonly icon: "●";
    readonly label: "overview";
}, {
    readonly id: "sync";
    readonly icon: "⇌";
    readonly label: "sync";
}, {
    readonly id: "daemon";
    readonly icon: "↺";
    readonly label: "daemon";
}, {
    readonly id: "device";
    readonly icon: "□";
    readonly label: "device";
}, {
    readonly id: "config";
    readonly icon: "✦";
    readonly label: "config";
}, {
    readonly id: "logs";
    readonly icon: "▪";
    readonly label: "logs";
}];
export type TabId = (typeof TABS)[number]['id'];
interface TabBarProps {
    active: TabId;
}
export declare const TabBar: React.NamedExoticComponent<TabBarProps>;
export {};
//# sourceMappingURL=TabBar.d.ts.map