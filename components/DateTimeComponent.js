function DateTimeComponent (){
    const selectedPlaylist=JSON.parse(localStorage.getItem("selectedPlaylist"))



    return`
     <div class="datetime">
                    ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: selectedPlaylist.timeFormat =="24hrs"? false : true }).format(new Date())}
                    &nbsp;
                    ${new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
                </div>
    `
}