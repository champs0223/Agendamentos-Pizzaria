/* Registros de satisfação enviados pelos canais de atendimento. */
(function (window) {
  const App = window.App = window.App || {};
  let feedback = [];
  let summary = { count: 0, average: null, positivePercent: null, distribution: [], monthly: [] };

  function normalize(item) {
    return {
      id: String(item.id || App.Utils.makeId()),
      appointmentId: String(item.appointmentId || ""),
      customerName: String(item.customerName || ""),
      rating: Number(item.rating),
      comment: String(item.comment || ""),
      source: String(item.source || "chatbot"),
      createdAt: String(item.createdAt || new Date().toISOString())
    };
  }

  App.Satisfacao = {
    init(data = {}) {
      summary = {
        count: Number(data.count) || 0,
        average: data.average == null ? null : Number(data.average),
        positivePercent: data.positivePercent == null ? null : Number(data.positivePercent),
        distribution: Array.isArray(data.distribution) ? data.distribution : [],
        monthly: Array.isArray(data.monthly) ? data.monthly : []
      };
      feedback = Array.isArray(data.recent)
        ? data.recent.filter(item => item && Number.isInteger(Number(item.rating)) && Number(item.rating) >= 1 && Number(item.rating) <= 5)
          .map(normalize)
        : [];
    },
    getAll() { return [...feedback]; },
    getSummary() { return { ...summary }; }
  };
})(window);
