const sendEmail = require("./send-email");

sendEmail("yuvaraj.k@nviera.com", "welcome.html", {}, "Welcome")
  .then(async (status) => {
    console.log(status);
    try {
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
      await send();
    } catch (erro) {
      console.error(erro);
    }
  })
  .catch((error) => {
    console.error(error);
  });

async function send() {
  // Starts the timer
  console.time();
  let status = await sendEmail("yuvaraj.k@nviera.com", "welcome.html", {}, "Welcome");
  console.log(status);
  // Ends the timer and print the time
  // taken by the piece of code
  console.timeEnd();
  return status;
}
