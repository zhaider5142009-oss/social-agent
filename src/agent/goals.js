import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class GoalTracker {
  constructor(store) {
    this.store = store;
  }

  update() {
    const totals = this.store.getTotals();
    for (const goal of this.store.state.goals) {
      if (goal.kpi === 'followers') {
        const progress = totals.followers / goal.target;
        goal.progress = Math.round(progress * 1000) / 10;
        if (progress >= 1) goal.status = 'complete';

        const thresholds = [
          { id: 's1', cond: () => totals.posts >= 50 },
          { id: 's2', cond: () => totals.replies >= 20 },
          { id: 's3', cond: () => Object.entries(this.store.state.platforms).every(([, p]) => p.posts >= 3) || Object.entries(this.store.state.platforms).filter(([, p]) => p.posts > 0).length >= 8 },
          { id: 's4', cond: () => totals.followers >= goal.target * 0.5 },
          { id: 's5', cond: () => typeof this.store.state.settings.analyticsTouched === 'number' },
        ];
        for (const t of thresholds) {
          const step = goal.steps.find((x) => x.id === t.id);
          if (step && !step.done && t.cond()) step.done = true;
        }
      }
    }
  }
}