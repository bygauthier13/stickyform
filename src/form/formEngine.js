// Form state and navigation. Independent of the DOM and of audio.

export class FormEngine extends EventTarget {
  /** @param {Array} questions */
  constructor(questions) {
    super();
    this.questions = questions;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.answers = {};
    this.furthest = 0;
    // sliders start answered at their default so they are never a dead end
    for (const q of this.questions) if (q.type === 'slider') this.answers[q.id] = q.default ?? 50;
    this._emit('reset');
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get total() {
    return this.questions.length;
  }

  get current() {
    return this.questions[this.index];
  }

  get isFirst() {
    return this.index === 0;
  }

  get isLast() {
    return this.index === this.total - 1;
  }

  /** Fraction of the form completed (0 on the first question, 1 after submitting). */
  get progress() {
    return this.index / this.total;
  }

  answerOf(id) {
    return this.answers[id];
  }

  setAnswer(id, value) {
    this.answers[id] = value;
    this._emit('answer', { id, value });
  }

  isAnswered(q = this.current) {
    const a = this.answers[q.id];
    switch (q.type) {
      case 'slider':
        return typeof a === 'number';
      case 'multi':
        return Array.isArray(a) && a.length >= 1 && a.length <= (q.max ?? Infinity);
      case 'text':
      case 'textarea':
        return !!q.optional || (typeof a === 'string' && a.trim().length > 0);
      default:
        return typeof a === 'string' && a.length > 0;
    }
  }

  canContinue() {
    return this.isAnswered();
  }

  next() {
    if (!this.canContinue()) return false;
    if (this.isLast) {
      this._emit('complete', { answers: { ...this.answers } });
      return true;
    }
    this.index++;
    this.furthest = Math.max(this.furthest, this.index);
    this._emit('step', { index: this.index, direction: 1 });
    return true;
  }

  back() {
    if (this.isFirst) return false;
    this.index--;
    this._emit('step', { index: this.index, direction: -1 });
    return true;
  }
}
