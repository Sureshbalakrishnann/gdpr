document.getElementById("userForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;

  // ❌ GDPR Violation: Storing data in localStorage without informing user or asking consent
  //localStorage.setItem("name", name);
  //localStorage.setItem("email", email);

  //document.getElementById("responseMessage").innerText = `Thanks for subscribing, ${name}!`;
});
