const baseUpdateSummary = updateSummary;

updateSummary = function updateExpandedSummary() {
  baseUpdateSummary();
  const counts = {
    countNeedsInfo: 'Needs Info',
    countDevelopment: 'In Development',
    countRetest: 'Ready for Retest'
  };

  Object.entries(counts).forEach(([id, status]) => {
    const target = document.getElementById(id);
    if (target) target.textContent = count(status);
  });
};

// Ensure the additional counters are populated even if reports finished loading
// before this enhancement script evaluated.
updateSummary();
