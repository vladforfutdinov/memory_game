memGame.filter('range', function () {
    return function (input, min, max) {
        min = parseInt(min);
        max = parseInt(max);
        for (var i = min; i <= max; i++)
            if (i % 2 == 0) input.push(i);
        return input;
    };
});

memGame.factory('utils', function () {
    return {
        floatArray: function (array) {
            var arr  = [],
                same = this;

            angular.forEach(array, function (item) {
                if (angular.isArray(item)) {
                    arr = arr.concat(same.floatArray(item));
                } else {
                    arr.push(item);
                }
            });

            return arr;
        },
        mixRow:     function (row) {
            var tmp, to,
                dup = row.slice(),
                getRnd = function (min, max) {
                    return parseInt(Math.random() * (max - min) + min);
                };

            for (var i = 0; i < row.length; i++) {
                to = getRnd(0, dup.length);
                tmp = dup.shift();
                dup.splice(to, 0, tmp);
            }

            return dup;
        }
    }
});