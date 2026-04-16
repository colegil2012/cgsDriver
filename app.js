const stopButtons = Array.from(document.querySelectorAll('.stop-item'));
const remainingStops = document.getElementById('remaining-stops');

function updateRemainingCount() {
  const completed = stopButtons.filter((button) => button.classList.contains('is-complete')).length;
  remainingStops.textContent = String(stopButtons.length - completed);
}

stopButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const completed = button.classList.toggle('is-complete');
    button.querySelector('.stop-status').textContent = completed ? 'Complete' : 'Pending';
    updateRemainingCount();
  });
});

updateRemainingCount();
