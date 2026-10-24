"""Draws docs/experiment-chart.png from docs/experiment-results.json (aggregates only).

    python3 scripts/experiment-chart.py   # needs matplotlib
"""
import json
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

r = json.load(open("docs/experiment-results.json"))
agg = r["overall"]
S = ["A", "A+", "B", "C"]
NAMES = {"A": "A popular (no taste)", "A+": "A+ popular in pool", "B": "B Qloo affinity only", "C": "C full planner"}
COLORS = {"A": "#9aa3b2", "A+": "#c7cdd6", "B": "#60a5fa", "C": "#10b981"}
panels = [
    ("Higher is better", [("meanCoverage", "Mean member\ncoverage"), ("diversity", "Category\ndiversity"), ("budgetFit", "Within\nbudget"), ("dietConfirmed", "Diet confirmed\nby Qloo tags")]),
    ("Lower is better", [("leftOutEverywhere", "Members left out\nby every option"), ("zeroShare", "Members with zero\ncoverage per option"), ("unknownHours", "Venues with\nunknown hours"), ("closedAtSlot", "Venues closed\nat planned time")]),
]
fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))
w = 0.2
for ax, (title, metrics) in zip(axes, panels):
    for j, s in enumerate(S):
        vals = [agg[s]["metrics"][k]["mean"] for k, _ in metrics]
        bars = ax.bar([i + (j - 1.5) * w for i in range(len(metrics))], vals, w, label=NAMES[s], color=COLORS[s])
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.01, f"{v:.2f}", ha="center", va="bottom", fontsize=6.5)
    ax.set_xticks(range(len(metrics)), [l for _, l in metrics], fontsize=8)
    ax.set_ylim(0, 1.08)
    ax.set_title(title, fontsize=10)
    ax.spines[["top", "right"]].set_visible(False)
axes[0].legend(fontsize=7.5, loc="upper left", frameon=False)
fig.suptitle(
    f"A/B/C on {r['teams']} synthetic teams ({r['members']} members), 4 cities, seed {r['seed']}: means over teams. "
    "Metrics use Qloo's own tags; no satisfaction data.",
    fontsize=9,
)
fig.tight_layout()
fig.savefig("docs/experiment-chart.png", dpi=150)
print("wrote docs/experiment-chart.png")
