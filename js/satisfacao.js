/* Registros de satisfação enviados pelos canais de atendimento. */
(function (window) {
  const App = window.App = window.App || {};
  const KEY = "mascavo-satisfacao-v1";
  let feedback = [];

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
    init() {
      const saved = App.Storage.read(KEY, []);
      feedback = Array.isArray(saved)
        ? saved.filter(item => item && Number.isInteger(Number(item.rating)) && Number(item.rating) >= 1 && Number(item.rating) <= 5)
          .map(normalize)
        : [];
    },
    getAll() { return [...feedback]; },
    replace(nextFeedback) {
      if (!Array.isArray(nextFeedback) || nextFeedback.some(item =>
        !item || !Number.isInteger(Number(item.rating)) || Number(item.rating) < 1 || Number(item.rating) > 5
      )) return false;
      const previous = feedback;
      feedback = nextFeedback.map(normalize);
      if (!App.Storage.write(KEY, feedback)) {
        feedback = previous;
        return false;
      }
      return true;
    }
  };
})(window);
