const firebaseConfig = {
 apiKey: "AIzaSyBba7XBrY1FC59OX9qztjgMNoNH1umPPq0",
  authDomain: "infintiapp.firebaseapp.com",
  projectId: "infintiapp",
  storageBucket: "infintiapp.firebasestorage.app",
  messagingSenderId: "617030192842",
  appId: "1:617030192842:web:f847f1030ce9e9613f2e33",
  measurementId: "G-8QDHMZ0QJZ"
};

firebase.initializeApp(firebaseConfig);
firebase.analytics();

var db = firebase.firestore();

window.logAllDnsEntries = function () {
  db.collection("DNS").get()
    .then(function (snapshot) {
      snapshot.forEach(function (doc) {
        console.log("DNS Entry:", doc.id, "=>", doc.data());
        localStorage.setItem("all_dns", JSON.stringify(doc.data().DNS));
      });

    })
    .catch(function (error) {
      Toaster.showToast("error", "Error getting DNS entries: " + error.message);
      // alert("Error getting DNS entries: " + error.message);
    });
};

window.getTmbdId = function () {
  db.collection("TMDBID").get()
    .then(function (snapshot) {
      snapshot.forEach(function (doc) {
        const tmbdId=doc.data().tmbd_api_key? doc.data().tmbd_api_key : ""
        console.log("TMDBID Entry:", doc.id, "=>", tmbdId);
        localStorage.setItem("tmbdId", tmbdId);
      });

    })
    .catch(function (error) {
        Toaster.showToast("error",
          "Error getting TMDBID entries: " + error.message);
      // alert("Error getting TMDBID entries: " + error.message);
    });
};
