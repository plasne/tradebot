
// on document ready
$(document).ready(() => {

    $.ajax({
        url: "/all",
        json: true
    }).done((all, status, xhr) => {

        $("body").empty();
        all.coins.forEach(coin => {
            $("<div />").text(coin.code).appendTo("body");
            coin.windows.forEach(window => {
                $("<div />").text(
                    `${window.name}: avg ${window.avg}, vol ${window.n}, flux ${window.min} to ${window.max} = ${window.flux}, chg ${window.first} to ${window.last} = ${window.chg}`
                ).appendTo("body");
            });
        });

    }).fail((xhr, status, error) => {

    });

});